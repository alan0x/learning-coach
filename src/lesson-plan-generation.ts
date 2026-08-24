import {
  LESSON_PLAN_CAPABILITY_NAMES,
  LESSON_PLAN_CAPABILITY_NUMBER_LIMITS,
  LESSON_PLAN_CAPABILITY_REGISTRY,
  LESSON_PLAN_CAPABILITIES,
  LESSON_PLAN_VISUAL_FEATURES,
  LessonPlanError,
  assembleLessonPlan,
  matchLessonPlanCapability,
  validateLessonPlanOutline,
  type LessonPlanOutline,
  type LessonPlanMathExpression,
  type LessonPlanSectionDraft,
  type LessonPlanVisualContent,
  type LessonPlanVisualFeature,
} from "./lesson-plan.js";
import {
  compileAndValidateLessonPlan,
  LESSON_PLAN_SCENE_INITIAL_CAMERAS,
  mathExpressionToOll,
  type CompileLessonPlanOptions,
  type CompiledLessonPlan,
} from "./lesson-plan-compiler.js";
import {
  buildLessonPlanBootstrapJsonSchema,
  buildLessonPlanOutlineJsonSchema,
  buildLessonPlanSectionDraftJsonSchema,
  buildLessonPlanAdmissionBootstrapJsonSchema,
  buildLessonPlanAdmissionOutlineJsonSchema,
  coerceLessonPlanBootstrapSectionModelNumbers,
  coerceLessonPlanOutlineModelNumbers,
  coerceLessonPlanSectionModelNumbers,
  LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES,
  LESSON_PLAN_VISUAL_PARAMETER_NAMES,
  type LessonPlanJsonSchema,
} from "./lesson-plan-schema.js";

export interface LessonPlanGenerationInput {
  turn_id: string;
  learner_request: string;
  language?: string;
  learner_context?: string;
  tutor_context?: string;
  request_parts?: string[];
  input_modality?: "text" | "voice";
}

export interface LessonPlanModelRequest {
  label: "lesson-plan-bootstrap" | "lesson-plan-outline" | "lesson-plan-section";
  turn_id: string;
  system_prompt: string;
  prompt: string;
  response_schema: LessonPlanJsonSchema;
  max_output_tokens: number;
  timeout_ms: number;
  part: "bootstrap" | "outline" | "section";
  section?: number;
  attempt: number;
}

export type LessonPlanModelCall = (request: LessonPlanModelRequest) => Promise<string>;

export interface GenerateLessonPlanOptions {
  max_attempts_per_part?: number;
  max_concurrency?: number;
  /** Total wall-clock budget for producing the first playable section. */
  first_playable_timeout_ms?: number;
  /** Ask for the outline and section 1 in the same provider request. */
  bootstrap_first_section?: boolean;
  compile?: CompileLessonPlanOptions;
  on_playable_prefix?: (event: {
    completed_sections: number;
    compiled: CompiledLessonPlan;
  }) => void | Promise<void>;
  on_concurrency_fallback?: (event: {
    section: number;
    reason: "rate_limited";
  }) => void | Promise<void>;
  on_rejected_part?: (event: {
    label: "lesson-plan-outline" | "lesson-plan-section";
    attempt: number;
    section?: number;
    error: { code: string; path?: string; message: string };
  }) => void | Promise<void>;
}

export interface GeneratedLessonPlan extends CompiledLessonPlan {
  outline: LessonPlanOutline;
  drafts: LessonPlanSectionDraft[];
  model_calls: number;
}

export interface NonLessonPlanResponse {
  disposition: "clarify" | "ignore";
  learner_response: string;
  model_calls: number;
}

export type LessonPlanGenerationResult = GeneratedLessonPlan | NonLessonPlanResponse;

const OUTLINE_SYSTEM_PROMPT = `设计一整节完整课程的目录，不生成 OLL，不填写执行 ID、组件名或自由对象名。
- course_visuals 一次列出课程真正需要的主要画面；只选 Schema 中的 required_features。相同画面后续必须复用，不能因标题、布局、范围、相机或颜色再建一份。只有确需并排比较时才用 comparison 并指向较早画面；supporting 也要指向较早画面。
- 需要切分并移动图形证明面积时，使用 polygon_pieces、rigid_rearrangement、area_relation；ordered_process_steps 只是静态流程，不能冒充移动图形或数值控件。
- numbers 只声明有教学作用的共享数值、教学范围和初始值。画面所需数值及顺序以 available_visual_recipes 为准。滑杆种类、步长和能力允许的执行范围由程序统一生成，不要填写或估算。
- request_coverage 逐项覆盖 request_parts。能落实才写 teach 和章节；明确要求但当前能力无法实现时写 unsupported、空章节和原因，不得用文字或错误画面冒充。
- sections 可以有多节；每节可有多段旁白、板书、动画和练习。close 只写总结。
只返回符合响应 Schema 的 JSON。`;

const SECTION_SYSTEM_PROMPT = `只编写课程目录指定的一节，不生成 OLL，不填写执行 ID、变量名、对象名或对象引用。
- 必须实际落实 assigned_request_parts。每段旁白与当时板书和动作放在同一 moment；可见文字直接对学习者说话，不能写“让学生……”。
- visuals_for_section 中 create 的画面只在根层 course_visual_creates 描述并指定 moment；reuse 的旧画面不得重建。普通公式、笔记只用 Schema 提供的清单。空清单省略。
- focuses 只写聚焦意图，points 只表示需要指示；程序选择真实对象并决定动作顺序。placement 只写相对方向。可复用普通板书只填根层必填项，不填写内部位置。
- 小数按 Schema 的 mantissa、scale 填写，例如 -1.5 为 -15、1；6.283 为 6283、3。
- number_activities 只选数值位置和目标值；scene3d_activities 只选预设视角。控件、容差、提示出现次数、相机和运行时引用由程序生成。
- function_plot 的 parameters.formulas 始终是公式数组，每项只写中缀公式右侧：x 是横轴，n1、n2 是课程第 1、2 个数值；支持 + - * / ^、括号、pi、e 和常见单参数函数。单条曲线可引用 n1、n2，例如 (x-n1)^2+n2；比较多条曲线时填写多个不含 n1、n2 的静态公式，例如 ["x", "x^2", "sin(x)"]。每条公式都必须依赖 x；程序逐条解析、绑定控件并计算坐标范围。函数图和三维曲面都不填写视窗、采样密度或网格精度。
- animations 只决定演示哪个数值、目标值和教学节奏；程序统一生成缓动方式。placement 只决定相对方向；程序统一生成锚点、对齐和间距。
- geometric_rearrangement 的数值表示重排进度；construction 从 Schema 选择。process_diagram 没有数值或动画。
只返回符合响应 Schema 的 JSON。`;

const BOOTSTRAP_SYSTEM_PROMPT = `${OUTLINE_SYSTEM_PROMPT}

同一次返回 outline 和 first_section。first_section 必须实现 outline 第一节，只使用 outline 已声明的数值、画面和可复用内容；内部位置、编号和引用由程序建立。
${SECTION_SYSTEM_PROMPT}`;

const ADMISSION_OUTLINE_SYSTEM_PROMPT = `用户正尝试从文字输入或语音输入开始一整节白板课程。先判断当前内容是否足以确定课程主题，不要从可用画面或数学能力猜测用户没有表达的主题。
- generate_lesson：用户提出了学习问题、解释请求，或清楚说出了想学习的主题。简短但明确的主题也属于这一类。此时填写完整 outline，learner_response 留空。
- clarify：这是真实话语，但内容残缺、含义不清或没有说明要学什么，无法可靠确定课程主题。此时不要填写 outline，用 learner_response 简短追问用户想学习什么。
- ignore：只是语气词、口头填充或没有可回应内容。此时不要填写 outline，learner_response 留空。
只做上述语义判断，不使用字数、语言或固定关键词作为规则。

${OUTLINE_SYSTEM_PROMPT}`;

const ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `用户正尝试从文字输入或语音输入开始一整节白板课程。先判断当前内容是否足以确定课程主题，不要从可用画面或数学能力猜测用户没有表达的主题。
- generate_lesson：用户提出了学习问题、解释请求，或清楚说出了想学习的主题。简短但明确的主题（例如“勾股定理”）也属于这一类。此时填写完整 outline 和 first_section，learner_response 留空。
- clarify：这是真实话语，但内容残缺、含义不清或没有说明要学什么，无法可靠确定课程主题。此时不要填写 outline 或 first_section，用 learner_response 简短追问用户想学习什么。例如 “The book.” 应追问用户想了解这本书的什么内容，而不是猜成数学课程。
- ignore：只是语气词、口头填充或没有可回应内容。此时不要填写 outline 或 first_section，learner_response 留空。
只做上述语义判断，不使用字数、语言或固定关键词作为规则。

${BOOTSTRAP_SYSTEM_PROMPT}`;

// Existing successful production traces use at most 1,985 candidate tokens
// for the combined outline + first section. These limits retain more than 2x
// headroom while preventing a malformed response from consuming the former
// 16,384-token allowance. A combined-request failure falls back to the smaller
// outline-only contract instead of repeating the same permissive request.
const LESSON_PLAN_BOOTSTRAP_MAX_OUTPUT_TOKENS = 4_096;
const LESSON_PLAN_OUTLINE_MAX_OUTPUT_TOKENS = 4_096;
const LESSON_PLAN_SECTION_MAX_OUTPUT_TOKENS = 4_096;
const LESSON_PLAN_MODEL_PART_TIMEOUT_MS = 30_000;
const LESSON_PLAN_FIRST_PLAYABLE_TIMEOUT_MS = 60_000;

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1) throw new Error(`${label} must be a positive integer`);
  return result;
}

function parseModelJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new LessonPlanError(
      "LESSON_PLAN_MODEL_JSON",
      `$${label}`,
      error instanceof Error ? error.message : "model output is not JSON",
    );
  }
}

function errorFeedback(error: unknown): string {
  if (error instanceof LessonPlanError) {
    return JSON.stringify({ code: error.code, path: error.path, message: error.message });
  }
  return JSON.stringify({ code: "LESSON_PLAN_GENERATION", message: error instanceof Error ? error.message : String(error) });
}

function rejectionDetails(error: unknown): { code: string; path?: string; message: string } {
  if (error instanceof LessonPlanError) {
    return { code: error.code, path: error.path, message: error.message };
  }
  return {
    code: "LESSON_PLAN_GENERATION",
    message: error instanceof Error ? error.message : String(error),
  };
}

function pruneModelNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneModelNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, pruneModelNulls(child)]),
  );
}

const TARGET_SLIDER_INTERVALS = 200;
const PROGRAM_HINT_AFTER_ATTEMPTS = 2;
const PROGRAM_ANIMATION_EASING = "linear" as const;
const PROGRAM_SCENE_ANGULAR_TOLERANCE_DEGREES = 7.5;
const PROGRAM_SCENE_ZOOM_TOLERANCE = 0.1;

/**
 * Convert a numeric teaching range into a stable slider step.
 * The model decides what the number means and which range is useful. This
 * function owns the mechanical resolution so a probabilistic decimal can
 * never create an unusable control or trigger another model request. Deriving
 * the step directly from the span also keeps both endpoints reachable.
 */
function deriveSliderStep(min: number, max: number): number {
  const span = max - min;
  return span / TARGET_SLIDER_INTERVALS;
}

function lowerModelOutline(value: unknown): unknown {
  const root = pruneModelNulls(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root as Record<string, unknown>;
  if (Array.isArray(candidate.numbers)) {
    candidate.numbers = candidate.numbers.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const number = { ...(entry as Record<string, unknown>) };
      delete number.student_control;
      if (typeof number.unit === "string" && !number.unit.trim()) delete number.unit;
      if (typeof number.label === "string" && !number.label.trim()) delete number.label;
      if (typeof number.min === "number"
        && Number.isFinite(number.min)
        && typeof number.max === "number"
        && Number.isFinite(number.max)
        && number.max > number.min) {
        number.student_control = {
          kind: "slider",
          step: deriveSliderStep(number.min, number.max),
        };
      } else if (number.student_control !== undefined) {
        // Older mock data or an out-of-date provider may still send step.
        // Discard it before validation: step is program-owned state.
        number.student_control = { kind: "slider" };
      }
      return number;
    });
  }
  if (Array.isArray(candidate.request_coverage)) {
    candidate.request_coverage = candidate.request_coverage.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const coverage = { ...(entry as Record<string, unknown>) };
      if (coverage.treatment === "teach") delete coverage.reason;
      return coverage;
    });
  }
  if (Array.isArray(candidate.course_visuals) && Array.isArray(candidate.sections)) {
    const sections = candidate.sections.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const section = { ...(entry as Record<string, unknown>) };
      section.allowed_capabilities = [];
      section.reusable_items = Array.isArray(section.reusable_items)
        ? section.reusable_items.filter((item) => (
          !item || typeof item !== "object" || Array.isArray(item)
            || (item as Record<string, unknown>).board_kind !== "visual"
        ))
        : [];
      return section;
    });
    candidate.course_visuals = candidate.course_visuals.map((entry, visualIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const visual = { ...(entry as Record<string, unknown>) };
      if (!Array.isArray(visual.required_features)) {
        throw new LessonPlanError(
          "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
          `$lessonPlanOutline.course_visuals[${visualIndex}].required_features`,
          "model output must describe controlled visual features; execution capability names are not accepted",
        );
      }
      {
        const featurePath = `$lessonPlanOutline.course_visuals[${visualIndex}].required_features`;
        const requestedFeatures = visual.required_features.map((feature, featureIndex) => {
          if (typeof feature !== "string" || !LESSON_PLAN_VISUAL_FEATURES.includes(feature as LessonPlanVisualFeature)) {
            throw new LessonPlanError(
              "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
              `${featurePath}[${featureIndex}]`,
              `unsupported visual feature: ${String(feature)}`,
            );
          }
          return feature;
        });
        visual.capability = matchLessonPlanCapability(requestedFeatures as LessonPlanVisualFeature[]);
        delete visual.required_features;
      }
      const createSection = Number(visual.create_section);
      const section = sections[createSection - 1];
      if (section && typeof section === "object" && !Array.isArray(section)) {
        const sectionRecord = section as Record<string, unknown>;
        const capabilities = Array.isArray(sectionRecord.allowed_capabilities)
          ? sectionRecord.allowed_capabilities : [];
        if (!capabilities.includes(visual.capability)) capabilities.push(visual.capability);
        sectionRecord.allowed_capabilities = capabilities;
        const reusableItems = Array.isArray(sectionRecord.reusable_items)
          ? sectionRecord.reusable_items : [];
        reusableItems.push({ kind: "board_item", board_kind: "visual", capability: visual.capability });
        sectionRecord.reusable_items = reusableItems;
        visual.reusable_item = reusableItems.length;
      }
      const useSections = Array.isArray(visual.use_sections) ? visual.use_sections : [];
      visual.use_sections = [...new Set([createSection, ...useSections])].sort((left, right) => Number(left) - Number(right));
      return visual;
    });
    candidate.sections = sections;
  }
  if (!candidate.close || typeof candidate.close !== "object" || Array.isArray(candidate.close)) return candidate;
  const close = { ...(candidate.close as Record<string, unknown>) };
  delete close.focus;
  const focus: Array<{ source: "reusable"; section: number; item: number }> = [];
  if (Array.isArray(candidate.course_visuals)) {
    for (let position = candidate.course_visuals.length; position >= 1 && focus.length < 2; position -= 1) {
      const visual = candidate.course_visuals[position - 1];
      if (!visual || typeof visual !== "object" || Array.isArray(visual)) continue;
      const item = visual as Record<string, unknown>;
      if (!Number.isInteger(item.create_section) || !Number.isInteger(item.reusable_item)) continue;
      focus.push({ source: "reusable", section: Number(item.create_section), item: Number(item.reusable_item) });
    }
  }
  if (focus.length === 0 && Array.isArray(candidate.sections)) {
    for (let section = candidate.sections.length; section >= 1 && focus.length < 2; section -= 1) {
      const sectionValue = candidate.sections[section - 1];
      if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) continue;
      const reusableItems = (sectionValue as Record<string, unknown>).reusable_items;
      if (!Array.isArray(reusableItems)) continue;
      for (let item = reusableItems.length; item >= 1 && focus.length < 2; item -= 1) {
        focus.push({ source: "reusable", section, item });
      }
    }
  }
  close.focus = focus.reverse();
  candidate.close = close;
  return candidate;
}

const modelActionCollections = {
  visual_creates: { action: "create", kind: "visual" },
  math_creates: { action: "create", kind: "math" },
  note_creates: { action: "create", kind: "note" },
  focuses: { action: "focus" },
  points: { action: "point_at" },
  animations: { action: "animate" },
} as const;

function lowerModelReference(value: unknown, currentMoment?: number): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const reference = value as Record<string, unknown>;
  const part = reference.part === undefined ? {} : { part: reference.part };
  if (reference.source === "local_board_item"
    || reference.source === "local_connection"
    || reference.source === "local_group") {
    return {
      source: reference.source,
      moment: reference.moment === 0 && currentMoment !== undefined ? currentMoment : reference.moment,
      item: reference.item,
      ...part,
    };
  }
  if (reference.source === "reusable") {
    return {
      source: "reusable",
      section: reference.section,
      item: reference.item,
      ...part,
    };
  }
  if (reference.source === "host") {
    return {
      source: "host",
      reference: reference.host_reference ?? reference.reference,
      ...part,
    };
  }
  return value;
}

const boardContentKeys: Record<string, readonly string[]> = {
  text: ["text"],
  math: ["latex"],
  shape: ["title", "items"],
  note: ["title", "items"],
  table: ["columns", "rows"],
  image: ["resource", "alt"],
};

type FormulaLexeme =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "left" | "right" };

const formulaFunctions = new Set([
  "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor",
  "ln", "log", "round", "sin", "sqrt", "tan",
]);

function formulaError(path: string, message: string): never {
  throw new LessonPlanError("LESSON_PLAN_EXPRESSION", path, message);
}

function formulaLexemes(rawFormula: unknown, path: string): FormulaLexeme[] {
  if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 256) {
    return formulaError(path, "expected a non-empty formula up to 256 characters");
  }
  let formula = rawFormula.trim()
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("π", "pi")
    .replaceAll("²", "^2")
    .replaceAll("³", "^3");
  const equals = [...formula.matchAll(/=/gu)];
  if (equals.length > 1) formulaError(path, "formula may contain at most one equals sign");
  if (equals.length === 1) {
    const index = equals[0].index ?? 0;
    const left = formula.slice(0, index).replaceAll(/\s+/gu, "").toLowerCase();
    if (left !== "y" && left !== "f(x)") {
      formulaError(path, "an optional formula left side must be y or f(x)");
    }
    formula = formula.slice(index + 1);
  }
  const compact = formula.replaceAll(/\s+/gu, "");
  const tokens: FormulaLexeme[] = [];
  for (let index = 0; index < compact.length;) {
    const rest = compact.slice(index);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(rest)?.[0];
    if (number) {
      const value = Number(number);
      if (!Number.isFinite(value)) formulaError(path, `invalid number '${number}'`);
      tokens.push({ kind: "number", value });
      index += number.length;
      continue;
    }
    const identifier = /^(?:n\d+|[a-z_][a-z_]*)/iu.exec(rest)?.[0];
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier.toLowerCase() });
      index += identifier.length;
      continue;
    }
    const character = compact[index];
    if (character === "(" || character === ")") {
      tokens.push({ kind: character === "(" ? "left" : "right" });
      index += 1;
      continue;
    }
    if (character === "+" || character === "-" || character === "*" || character === "/" || character === "^") {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }
    formulaError(path, `unsupported formula character '${character}'`);
  }
  const withImplicitMultiplication: FormulaLexeme[] = [];
  const canEndValue = (token: FormulaLexeme): boolean => (
    token.kind === "number" || token.kind === "identifier" || token.kind === "right"
  );
  const canStartValue = (token: FormulaLexeme): boolean => (
    token.kind === "number" || token.kind === "identifier" || token.kind === "left"
  );
  for (const token of tokens) {
    const previous = withImplicitMultiplication.at(-1);
    const functionCall = previous?.kind === "identifier"
      && formulaFunctions.has(previous.value)
      && token.kind === "left";
    if (previous && canEndValue(previous) && canStartValue(token) && !functionCall) {
      withImplicitMultiplication.push({ kind: "operator", value: "*" });
    }
    withImplicitMultiplication.push(token);
  }
  return withImplicitMultiplication;
}

function parseModelFormula(rawFormula: unknown, numberCount: number, path: string): LessonPlanMathExpression {
  const lexemes = formulaLexemes(rawFormula, path);
  let position = 0;
  const peek = (): FormulaLexeme | undefined => lexemes[position];
  const take = (): FormulaLexeme | undefined => lexemes[position++];
  const binary = (
    left: LessonPlanMathExpression,
    right: LessonPlanMathExpression,
    operator: "add" | "subtract" | "multiply" | "divide" | "power",
  ): LessonPlanMathExpression => [...left, ...right, { kind: "operator", operator }];

  let parseExpression: () => LessonPlanMathExpression;
  let parseUnary: () => LessonPlanMathExpression;
  const parsePrimary = (): LessonPlanMathExpression => {
    const token = take();
    if (!token) return formulaError(path, "formula ended before a value");
    if (token.kind === "number") return [{ kind: "literal", value: token.value }];
    if (token.kind === "left") {
      const value = parseExpression();
      if (take()?.kind !== "right") formulaError(path, "formula has an unclosed parenthesis");
      return value;
    }
    if (token.kind !== "identifier") return formulaError(path, "expected a number, x, n1, constant, or function");
    if (token.value === "x") return [{ kind: "input" }];
    if (token.value === "pi" || token.value === "e") return [{ kind: "constant", name: token.value }];
    const numberMatch = /^n(\d+)$/u.exec(token.value);
    if (numberMatch) {
      const number = Number(numberMatch[1]);
      if (number < 1 || number > numberCount) {
        formulaError(path, `formula references unavailable numeric control n${number}`);
      }
      return [{ kind: "number", number }];
    }
    if (!formulaFunctions.has(token.value)) formulaError(path, `unsupported formula name '${token.value}'`);
    if (take()?.kind !== "left") formulaError(path, `function ${token.value} requires parentheses`);
    const argument = parseExpression();
    if (take()?.kind !== "right") formulaError(path, `function ${token.value} has an unclosed parenthesis`);
    return [...argument, {
      kind: "function",
      name: token.value as "abs" | "acos" | "asin" | "atan" | "ceil" | "cos" | "exp" | "floor" | "ln" | "log" | "round" | "sin" | "sqrt" | "tan",
    }];
  };
  const parsePower = (): LessonPlanMathExpression => {
    const left = parsePrimary();
    const token = peek();
    if (token?.kind === "operator" && token.value === "^") {
      take();
      return binary(left, parseUnary(), "power");
    }
    return left;
  };
  parseUnary = (): LessonPlanMathExpression => {
    const token = peek();
    if (token?.kind === "operator" && (token.value === "+" || token.value === "-")) {
      take();
      const value = parseUnary();
      return token.value === "-" ? [...value, { kind: "negate" }] : value;
    }
    return parsePower();
  };
  const parseProduct = (): LessonPlanMathExpression => {
    let value = parseUnary();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || (token.value !== "*" && token.value !== "/")) break;
      take();
      value = binary(value, parseUnary(), token.value === "*" ? "multiply" : "divide");
    }
    return value;
  };
  parseExpression = (): LessonPlanMathExpression => {
    let value = parseProduct();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      take();
      value = binary(value, parseProduct(), token.value === "+" ? "add" : "subtract");
    }
    return value;
  };
  const result = parseExpression();
  if (position !== lexemes.length) formulaError(path, "formula contains an unexpected trailing token");
  if (!result.some((token) => token.kind === "input")) {
    formulaError(path, "a function plot formula must depend on x");
  }
  return result;
}

function lowerModelBoardContent(kind: unknown, value: unknown, numberCount: number): unknown {
  if (typeof kind !== "string" || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const content = value as Record<string, unknown>;
  if (kind !== "visual") {
    const allowed = boardContentKeys[kind];
    if (!allowed) return value;
    const lowered = Object.fromEntries(
      allowed.filter((key) => content[key] !== undefined).map((key) => [key, content[key]]),
    );
    if ((kind === "note" || kind === "shape")
      && (typeof lowered.title !== "string" || !lowered.title.trim())
      && Array.isArray(lowered.items)
      && typeof lowered.items[0] === "string"
      && lowered.items[0].trim()) {
      lowered.title = lowered.items[0].trim().slice(0, 240);
    }
    return lowered;
  }
  const capability = content.capability;
  const parameters = content.parameters && typeof content.parameters === "object" && !Array.isArray(content.parameters)
    ? { ...(content.parameters as Record<string, unknown>) }
    : {};
  let forceNoNumbers = false;
  if (capability === "function_plot") {
    const rawFormulas = parameters.formulas !== undefined
      ? parameters.formulas
      : typeof parameters.expression === "string"
        ? [parameters.expression]
        : Array.isArray(parameters.expressions)
          ? parameters.expressions
          : undefined;
    if (rawFormulas !== undefined) {
      if (!Array.isArray(rawFormulas)
        || rawFormulas.length < 1
        || rawFormulas.length > 8) {
        formulaError(
          "$lessonPlanSection.visual.parameters.formulas",
          "expected one to eight formulas",
        );
      }
      // The provider can occasionally return an older synonymous field in
      // addition to `formulas`, even under a response schema. Select one
      // semantic source and erase all execution representations before the
      // program builds exactly one canonical representation below.
      delete parameters.formulas;
      delete parameters.expression;
      delete parameters.expressions;
      delete parameters.expression_tokens;
      const parsed = rawFormulas.map((formula, index) => parseModelFormula(
        formula,
        numberCount,
        `$lessonPlanSection.visual.parameters.formulas[${index}]`,
      ));
      if (parsed.length === 1) {
        parameters.expression_tokens = parsed[0];
      } else {
        if (parsed.some((expression) => expression.some((token) => token.kind === "number"))) {
          formulaError(
            "$lessonPlanSection.visual.parameters.formulas",
            "a multi-curve comparison currently supports static formulas only; use one formula when lesson numbers change the whole curve",
          );
        }
        // Formula text is a teaching choice. Curve identity and duplicate
        // handling are execution details: canonicalize and deduplicate them in
        // the program so a probabilistic repeated formula cannot render the
        // same curve twice.
        const canonical = parsed.map(mathExpressionToOll);
        const retainedIndexes: number[] = [];
        const seen = new Set<string>();
        canonical.forEach((expression, index) => {
          if (seen.has(expression)) return;
          seen.add(expression);
          retainedIndexes.push(index);
        });
        parameters.expressions = retainedIndexes.map((index) => canonical[index]);
        if (Array.isArray(parameters.curve_labels)
          && parameters.curve_labels.length === canonical.length) {
          parameters.curve_labels = retainedIndexes.map((index) => parameters.curve_labels![index]);
        } else {
          // Labels are optional presentation text. If they do not align with
          // the actual curves, derive safe labels from the expressions instead
          // of rejecting and regenerating the lesson.
          delete parameters.curve_labels;
        }
        // A single-curve label from a speculative draft cannot safely name the
        // first member of a later multi-curve comparison.
        delete parameters.curve_label;
        // A multi-curve request is an explicit static comparison. A stray
        // model-authored number must never turn it into a moving-point lesson.
        forceNoNumbers = true;
      }
    }
  }
  if (typeof content.title === "string" && parameters.title === undefined) parameters.title = content.title;
  if (typeof capability === "string" && capability in LESSON_PLAN_VISUAL_PARAMETER_NAMES) {
    const allowedParameters = new Set(
      LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES[
        capability as keyof typeof LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES
      ],
    );
    for (const key of Object.keys(parameters)) {
      if (!allowedParameters.has(key)) delete parameters[key];
    }
  }
  const numberLimit = typeof capability === "string" && capability in LESSON_PLAN_CAPABILITY_NUMBER_LIMITS
    ? LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability as keyof typeof LESSON_PLAN_CAPABILITY_NUMBER_LIMITS]
    : 0;
  let validNumbers = Array.isArray(content.numbers)
    ? [...new Set(content.numbers.filter((number) => (
      Number.isInteger(number) && Number(number) >= 1 && Number(number) <= numberCount
    )))].slice(0, numberLimit)
    : [];
  if (forceNoNumbers) validNumbers = [];
  if (capability === "function_plot" && Array.isArray(parameters.expression_tokens)) {
    const formulaNumbers = [...new Set(parameters.expression_tokens.flatMap((token) => (
      token && typeof token === "object" && !Array.isArray(token)
        && (token as Record<string, unknown>).kind === "number"
        && Number.isInteger((token as Record<string, unknown>).number)
        ? [Number((token as Record<string, unknown>).number)]
        : []
    )))].filter((number) => number >= 1 && number <= numberCount).slice(0, numberLimit);
    if (formulaNumbers.length > 0) validNumbers = formulaNumbers;
  }
  if (!forceNoNumbers
    && validNumbers.length === 0
    && numberCount === 1
    && typeof capability === "string"
    && capability in LESSON_PLAN_CAPABILITIES
    && LESSON_PLAN_CAPABILITIES[capability as keyof typeof LESSON_PLAN_CAPABILITIES]
      .includes("primary_control" as never)) {
    validNumbers = [1];
  }
  return {
    ...(capability === undefined ? {} : { capability }),
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    ...(validNumbers.length === 0 ? {} : { numbers: validNumbers }),
  };
}

/**
 * Remove interactions that cannot affect any compiled visual.
 *
 * The model may decide that a lesson benefits from a numeric idea and choose
 * its teaching range. Whether a slider, animation, or task is executable is
 * program-owned: an interaction without a visual binding is dead UI and must
 * not make the whole lesson fail or trigger another model request.
 */
function normalizeExecutableNumberInteractions(
  outlineValue: LessonPlanOutline,
  draftValues: LessonPlanSectionDraft[],
): { outline: LessonPlanOutline; drafts: LessonPlanSectionDraft[] } {
  const outline = structuredClone(outlineValue);
  const drafts = structuredClone(draftValues);
  const visuallyBound = new Set<number>();
  for (const section of drafts) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if ((action.action !== "create" && action.action !== "revise") || action.kind !== "visual") continue;
        const visual = action.content as LessonPlanVisualContent;
        for (const number of visual.numbers ?? []) visuallyBound.add(number);
      }
    }
  }
  outline.numbers?.forEach((number, index) => {
    if (!visuallyBound.has(index + 1)) delete number.student_control;
  });
  for (const section of drafts) {
    for (const moment of section.moments) {
      moment.actions = moment.actions.filter((action) => (
        action.action !== "animate" || visuallyBound.has(action.number)
      ));
      if (moment.actions.length === 0) {
        // Removing a dead animation can leave a narration-only moment. OLL
        // requires an executable action per beat, so keep the narration and
        // give the teacher a neutral expression instead of asking the model to
        // rewrite an otherwise usable section.
        moment.actions.push({
          action: "teacher_expression",
          expression: "neutral",
          timing: "after_speech",
        });
      }
    }
    if (!section.student_activities) continue;
    section.student_activities = section.student_activities.flatMap((activity) => {
      if (activity.kind !== "number_target") return [activity];
      const numberControls = activity.number_controls.filter(({ number }) => visuallyBound.has(number));
      const expressionNumbers = new Set((activity.expression ?? []).flatMap((token) => (
        token.kind === "number" ? [token.number] : []
      )));
      if (numberControls.length === 0
        || [...expressionNumbers].some((number) => !visuallyBound.has(number))) return [];
      return [{ ...activity, number_controls: numberControls }];
    });
    if (section.student_activities.length === 0) delete section.student_activities;
  }
  return { outline, drafts };
}

function lowerModelActionReferences(
  actionName: string,
  action: Record<string, unknown>,
  currentMoment: number,
  numberCount: number,
): Record<string, unknown> {
  const lowered = { ...action };
  if (actionName === "create" || actionName === "revise") {
    lowered.content = lowerModelBoardContent(lowered.kind, lowered.content, numberCount);
  }
  if (actionName === "create" && lowered.placement && typeof lowered.placement === "object"
    && !Array.isArray(lowered.placement)) {
    const placement = { ...(lowered.placement as Record<string, unknown>) };
    if (placement.reference !== undefined) placement.reference = lowerModelReference(placement.reference, currentMoment);
    lowered.placement = placement;
  }
  if (actionName === "point_at") {
    delete lowered.reference;
  } else if (actionName === "revise" || actionName === "emphasize") {
    lowered.reference = lowerModelReference(lowered.reference, currentMoment);
  }
  if (actionName === "connect") {
    lowered.from_ref = lowerModelReference(lowered.from_ref, currentMoment);
    lowered.to_ref = lowerModelReference(lowered.to_ref, currentMoment);
  }
  if (actionName === "group" && Array.isArray(lowered.members)) {
    lowered.members = lowered.members.map((reference) => lowerModelReference(reference, currentMoment));
  }
  if (actionName === "focus") delete lowered.references;
  if (actionName === "animate") {
    delete lowered.easing;
    lowered.easing = PROGRAM_ANIMATION_EASING;
  }
  if (lowered.placement && typeof lowered.placement === "object" && !Array.isArray(lowered.placement)) {
    const placement = { ...(lowered.placement as Record<string, unknown>) };
    delete placement.align;
    delete placement.gap;
    lowered.placement = placement;
  }
  return lowered;
}

function lowerIntegerDecimal(record: Record<string, unknown>, prefix: string, path: string): number {
  const mantissa = record[`${prefix}_mantissa`];
  const scale = record[`${prefix}_scale`];
  if (!Number.isInteger(mantissa)
    || Math.abs(Number(mantissa)) > 1_000_000_000_000
    || !Number.isInteger(scale)
    || Number(scale) < 0
    || Number(scale) > 6) {
    throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected bounded integer mantissa and scale from 0 to 6");
  }
  delete record[`${prefix}_mantissa`];
  delete record[`${prefix}_scale`];
  return Number(mantissa) / 10 ** Number(scale);
}

function lowerModelActivityNumbers(
  activity: Record<string, unknown>,
  kind: "number_target" | "scene3d_view",
  path: string,
  outline: LessonPlanOutline,
  expectedSection: number,
): Record<string, unknown> {
  const lowered = { ...activity };
  delete lowered.hint_after_attempts;
  lowered.hint_after_attempts = PROGRAM_HINT_AFTER_ATTEMPTS;
  if (kind === "number_target") {
    const requestedValue = lowerIntegerDecimal(lowered, "value", `${path}.value`);
    delete lowered.expression;
    delete lowered.tolerance;
    delete lowered.tolerance_mantissa;
    delete lowered.tolerance_scale;
    const numberIndex = Number(lowered.number);
    delete lowered.number;
    const definition = outline.numbers?.[numberIndex - 1];
    if (!definition) {
      throw new LessonPlanError("LESSON_PLAN_ACTIVITY", `${path}.number_controls`, "expected one existing numeric control");
    }
    const canUseGeometryPoint = (outline.numbers?.length ?? 0) === 1
      && outline.sections.slice(0, expectedSection).some((section) => (
        (section.reusable_items ?? []).some((item) => (
          item.capability !== undefined
          && LESSON_PLAN_CAPABILITY_REGISTRY[item.capability].student_controls.includes("geometry_point" as never)
        ))
        || section.allowed_capabilities.some((capability) => (
          LESSON_PLAN_CAPABILITY_REGISTRY[capability].student_controls.includes("geometry_point" as never)
        ))
      ));
    lowered.number_controls = [{
      number: numberIndex,
      controls: ["slider", ...(canUseGeometryPoint ? ["geometry_point"] : [])],
    }];
    const minimum = Number(definition.min);
    const maximum = Number(definition.max);
    const range = maximum - minimum;
    const step = definition.student_control?.step;
    const snapToReachableValue = (value: number): number => {
      let reachable = Math.min(maximum, Math.max(minimum, value));
      if (typeof step === "number" && Number.isFinite(step) && step > 0) {
        const stepCount = Math.round((reachable - minimum) / step);
        reachable = Math.min(maximum, Math.max(minimum, minimum + stepCount * step));
      }
      return reachable;
    };
    let reachableValue = snapToReachableValue(requestedValue);
    const tolerance = Math.max(
      typeof step === "number" && Number.isFinite(step) && step > 0 ? step / 2 : 0,
      range / 1000,
      1e-6,
    );
    const initial = Number(definition.initial);
    if (Math.abs(reachableValue - initial) <= tolerance) {
      const alternatives = [minimum, maximum]
        .map(snapToReachableValue)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => Math.abs(right - initial) - Math.abs(left - initial));
      const alternative = alternatives.find((value) => Math.abs(value - initial) > tolerance);
      if (alternative === undefined) {
        throw new LessonPlanError(
          "LESSON_PLAN_ACTIVITY",
          path,
          "numeric task has no reachable target distinct from the initial value",
        );
      }
      reachableValue = alternative;
      const formattedValue = Number(reachableValue.toPrecision(12));
      const label = definition.label?.trim() || "数值";
      const unit = definition.unit?.trim();
      lowered.prompt = `请把${label}调到 ${formattedValue}${unit ? ` ${unit}` : ""}。`;
      lowered.hints = ["拖动左下角的滑杆，观察数值和画面同步变化。"];
      lowered.success_message = `完成，${label}已经调到 ${formattedValue}${unit ? ` ${unit}` : ""}。`;
    }
    const precision = 10 ** 12;
    lowered.value = Math.round(reachableValue * precision) / precision;
    lowered.tolerance = tolerance;
  } else {
    const presets = {
      top: { yaw: 0, pitch: Math.PI / 2, zoom: 1 },
      front: { yaw: 0, pitch: 0, zoom: 1 },
      right: { yaw: Math.PI / 2, pitch: 0, zoom: 1 },
      left: { yaw: -Math.PI / 2, pitch: 0, zoom: 1 },
      isometric: { yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 1 },
    } as const;
    let preset = typeof lowered.view_preset === "string"
      ? presets[lowered.view_preset as keyof typeof presets]
      : undefined;
    if (!preset) {
      throw new LessonPlanError("LESSON_PLAN_ACTIVITY", path, "expected a supported 3D view preset");
    }
    delete lowered.view_preset;
    delete lowered.angular_tolerance_degrees;
    delete lowered.zoom_tolerance_percent;
    let angularTolerance = PROGRAM_SCENE_ANGULAR_TOLERANCE_DEGREES;
    const sceneCapability = outline.sections.slice(0, expectedSection).flatMap((section) => [
      ...section.allowed_capabilities,
      ...(section.reusable_items ?? []).flatMap((item) => item.capability ? [item.capability] : []),
    ]).reverse().find((capability) => capability in LESSON_PLAN_SCENE_INITIAL_CAMERAS) as
      keyof typeof LESSON_PLAN_SCENE_INITIAL_CAMERAS | undefined;
    const initial = sceneCapability ? LESSON_PLAN_SCENE_INITIAL_CAMERAS[sceneCapability] : undefined;
    if (initial && preset) {
      const separationDegrees = Math.max(
        Math.abs(preset.yaw - initial.yaw),
        Math.abs(preset.pitch - initial.pitch),
      ) * 180 / Math.PI;
      if (separationDegrees < 0.01) {
        preset = presets.top;
        angularTolerance = Math.min(angularTolerance, 10);
      } else {
        angularTolerance = Math.min(angularTolerance, Math.max(0.25, separationDegrees / 2));
      }
    }
    Object.assign(lowered, {
      match: "view_direction",
      ...preset,
      angular_tolerance: angularTolerance * Math.PI / 180,
      zoom_tolerance: PROGRAM_SCENE_ZOOM_TOLERANCE,
    });
  }
  return lowered;
}

function reconcileBootstrapFirstSectionPositions(
  value: unknown,
  outline: LessonPlanOutline,
): unknown {
  const root = structuredClone(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root as Record<string, unknown>;
  if (!Array.isArray(candidate.moments)) return root;

  type CreateCandidate = {
    entry: Record<string, unknown>;
    moment: number;
    order: number;
    index: number;
  };
  const collect = (collection: "visual_creates" | "math_creates" | "note_creates"): CreateCandidate[] => (
    candidate.moments.flatMap((momentValue, momentIndex) => {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) return [];
      const entries = (momentValue as Record<string, unknown>)[collection];
      if (!Array.isArray(entries)) return [];
      return entries.flatMap((entry, entryIndex) => (
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? [{
            entry: entry as Record<string, unknown>,
            moment: momentIndex + 1,
            order: Number((entry as Record<string, unknown>).order),
            index: entryIndex,
          }]
          : []
      ));
    }).sort((left, right) => (
      left.moment - right.moment
      || (Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ))
  );

  const visualCreates = collect("visual_creates");
  for (const { entry } of visualCreates) {
    delete entry.course_visual;
    delete entry.reusable_item;
  }
  const unmatchedVisuals = new Set(visualCreates);
  const expectedVisuals = (outline.course_visuals ?? [])
    .map((visual, index) => ({ visual, position: index + 1 }))
    .filter(({ visual }) => visual.create_section === 1);
  for (const { visual, position } of expectedVisuals) {
    const match = visualCreates.find((candidateEntry) => {
      if (!unmatchedVisuals.has(candidateEntry)) return false;
      const content = candidateEntry.entry.content;
      return content && typeof content === "object" && !Array.isArray(content)
        && (content as Record<string, unknown>).capability === visual.capability;
    });
    if (!match) continue;
    match.entry.course_visual = position;
    unmatchedVisuals.delete(match);
  }
  if (unmatchedVisuals.size > 0 && expectedVisuals.length === 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_COURSE_VISUAL",
      "$lessonPlanModelSection.moments",
      "the bootstrap section created a visual that the outline did not declare",
    );
  }
  if (unmatchedVisuals.size > 0) {
    const unmatchedEntries = new Set([...unmatchedVisuals].map(({ entry }) => entry));
    for (const momentValue of candidate.moments) {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
      const moment = momentValue as Record<string, unknown>;
      if (!Array.isArray(moment.visual_creates)) continue;
      moment.visual_creates = moment.visual_creates.filter((entry) => !unmatchedEntries.has(
        entry as Record<string, unknown>,
      ));
    }
  }

  const createsByKind = {
    math: collect("math_creates"),
    note: collect("note_creates"),
  };
  for (const entries of Object.values(createsByKind)) {
    for (const { entry } of entries) delete entry.reusable_item;
  }
  const usedBoardCreates = new Set<CreateCandidate>();
  const reusableItems = outline.sections[0]?.reusable_items ?? [];
  reusableItems.forEach((item, index) => {
    if (item.kind !== "board_item" || (item.board_kind !== "math" && item.board_kind !== "note")) return;
    const match = createsByKind[item.board_kind].find((candidateEntry) => !usedBoardCreates.has(candidateEntry));
    if (!match) return;
    match.entry.reusable_item = index + 1;
    usedBoardCreates.add(match);
  });

  return root;
}

/**
 * The combined bootstrap response contains both the outline's reusable-card
 * declarations and the first section that is supposed to create them. Those
 * two model-written lists can disagree. At this point the actual first-section
 * creates are authoritative: an uncreated declaration cannot be referenced by
 * the runtime, so remove it and deterministically renumber the declarations
 * that really exist. Course visuals are never removed here.
 *
 * If a text-only first section created math or a note without declaring any
 * reusable item, promote its last created card so a progressive prefix still
 * has a concrete focus target. Later sections receive this reconciled outline,
 * so they can only reuse objects that the first section actually created.
 */
function reconcileBootstrapReusableDeclarations(
  value: unknown,
  outline: LessonPlanOutline,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.moments)) return value;
  const section = outline.sections[0];
  if (!section) return value;

  const oldItems = [...(section.reusable_items ?? [])];
  const creates: Array<{
    kind: "math" | "note";
    entry: Record<string, unknown>;
    oldPosition?: number;
    source: "moment" | "root";
  }> = [];
  for (const momentValue of candidate.moments) {
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
    const moment = momentValue as Record<string, unknown>;
    for (const [collection, kind] of [["math_creates", "math"], ["note_creates", "note"]] as const) {
      const entries = moment[collection];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const record = entry as Record<string, unknown>;
          const position = Number(record.reusable_item);
          creates.push({
            kind,
            entry: record,
            ...(Number.isInteger(position) && position > 0 ? { oldPosition: position } : {}),
            source: "moment",
          });
        }
      }
    }
  }
  const rootCreates = candidate.reusable_board_creates;
  if (rootCreates && typeof rootCreates === "object" && !Array.isArray(rootCreates)) {
    for (const [key, entry] of Object.entries(rootCreates as Record<string, unknown>)) {
      const match = /^item_(\d+)$/u.exec(key);
      const oldPosition = Number(match?.[1]);
      const declaration = oldItems[oldPosition - 1];
      if (!Number.isInteger(oldPosition)
        || !entry
        || typeof entry !== "object"
        || Array.isArray(entry)
        || declaration?.kind !== "board_item"
        || (declaration.board_kind !== "math" && declaration.board_kind !== "note")) continue;
      creates.push({
        kind: declaration.board_kind,
        entry: entry as Record<string, unknown>,
        oldPosition,
        source: "root",
      });
    }
  }

  const filledPositions = new Set<number>(
    creates.flatMap(({ oldPosition }) => (
      oldPosition !== undefined && Number.isInteger(oldPosition) && oldPosition > 0
        ? [oldPosition]
        : []
    )),
  );
  const hasCreatedOrVisual = oldItems.some((item, index) => (
    item.kind === "board_item"
      && (item.board_kind === "visual" || filledPositions.has(index + 1))
  ));
  if (!hasCreatedOrVisual && creates.length > 0) {
    const promoted = [...creates].reverse().find(({ source }) => source === "moment");
    if (promoted) {
      oldItems.push({ kind: "board_item", board_kind: promoted.kind });
      promoted.oldPosition = oldItems.length;
      promoted.entry.reusable_item = oldItems.length;
      filledPositions.add(oldItems.length);
    }
  }

  const positionMap = new Map<number, number>();
  const reconciledItems = oldItems.filter((item, index) => {
    const keep = item.kind === "board_item"
      && (item.board_kind === "visual" || filledPositions.has(index + 1));
    if (keep) positionMap.set(index + 1, positionMap.size + 1);
    return keep;
  });
  section.reusable_items = reconciledItems;

  for (const { entry, oldPosition, source } of creates) {
    const newPosition = oldPosition === undefined ? undefined : positionMap.get(oldPosition);
    if (source !== "moment") continue;
    if (newPosition === undefined) delete entry.reusable_item;
    else entry.reusable_item = newPosition;
  }
  if (rootCreates && typeof rootCreates === "object" && !Array.isArray(rootCreates)) {
    candidate.reusable_board_creates = Object.fromEntries(
      creates.flatMap(({ entry, oldPosition, source }) => {
        if (source !== "root") return [];
        const newPosition = oldPosition === undefined ? undefined : positionMap.get(oldPosition);
        return newPosition === undefined ? [] : [[`item_${newPosition}`, entry]];
      }),
    );
  }
  for (const visual of outline.course_visuals ?? []) {
    if (visual.create_section !== 1) continue;
    const newPosition = positionMap.get(visual.reusable_item);
    if (newPosition === undefined) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        "$lessonPlanOutline.course_visuals",
        "a first-section course visual lost its reusable position during bootstrap reconciliation",
      );
    }
    visual.reusable_item = newPosition;
  }

  outline.close.focus = outline.close.focus.flatMap((reference) => {
    if (reference.source !== "reusable" || reference.section !== 1) return [reference];
    const newPosition = positionMap.get(reference.item);
    return newPosition === undefined ? [] : [{ ...reference, item: newPosition }];
  });
  if (outline.close.focus.length === 0 && reconciledItems.length > 0) {
    outline.close.focus = [{ source: "reusable", section: 1, item: reconciledItems.length }];
  }
  return value;
}

function lowerModelSectionDraft(
  value: unknown,
  outline: LessonPlanOutline,
  expectedSection: number,
  requireFixedReusableCreates = false,
): LessonPlanSectionDraft {
  const root = pruneModelNulls(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection", "expected an object");
  }
  const candidate = root as Record<string, unknown>;
  const allowedRoot = new Set([
    "version", "section", "moments", "course_visual_creates", "reusable_board_creates",
    "number_activities", "scene3d_activities",
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedRoot.has(key)) throw new LessonPlanError("LESSON_PLAN_UNKNOWN_FIELD", `$lessonPlanModelSection.${key}`, "unknown field");
  }
  if (candidate.section !== expectedSection) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.section", `expected section ${expectedSection}`);
  }
  if (!Array.isArray(candidate.moments) || candidate.moments.length === 0) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.moments", "expected at least one moment");
  }
  if (candidate.number_activities !== undefined && !Array.isArray(candidate.number_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.number_activities", "expected an array");
  }
  if (candidate.scene3d_activities !== undefined && !Array.isArray(candidate.scene3d_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.scene3d_activities", "expected an array");
  }
  const courseVisuals = outline.course_visuals ?? [];
  const courseVisualsToCreate = courseVisuals
    .map((visual, index) => ({ visual, position: index + 1 }))
    .filter(({ visual }) => visual.create_section === expectedSection);
  const reusableBoardItemsToCreate = (outline.sections[expectedSection - 1]?.reusable_items ?? [])
    .map((item, index) => ({ item, position: index + 1 }))
    .filter(({ item }) => item.kind === "board_item" && item.board_kind !== "visual");
  if (requireFixedReusableCreates
    && courseVisualsToCreate.length > 0
    && candidate.course_visual_creates === undefined) {
    throw new LessonPlanError(
      "LESSON_PLAN_COURSE_VISUAL",
      "$lessonPlanModelSection.course_visual_creates",
      "the section must describe every outline-declared visual in the required course visual object",
    );
  }
  const fixedCourseCreates = new Map<number, Array<Record<string, unknown>>>();
  if (candidate.course_visual_creates !== undefined) {
    if (!candidate.course_visual_creates
      || typeof candidate.course_visual_creates !== "object"
      || Array.isArray(candidate.course_visual_creates)) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        "$lessonPlanModelSection.course_visual_creates",
        "expected an object containing every required course visual",
      );
    }
    const supplied = candidate.course_visual_creates as Record<string, unknown>;
    const expectedKeys = new Set(courseVisualsToCreate.map(({ position }) => `visual_${position}`));
    for (const key of Object.keys(supplied)) {
      if (!expectedKeys.has(key)) {
        throw new LessonPlanError(
          "LESSON_PLAN_COURSE_VISUAL",
          `$lessonPlanModelSection.course_visual_creates.${key}`,
          "course visual is not declared for this section",
        );
      }
    }
    for (const { visual, position } of courseVisualsToCreate) {
      const key = `visual_${position}`;
      const source = supplied[key];
      const entryPath = `$lessonPlanModelSection.course_visual_creates.${key}`;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", entryPath, "required course visual is missing");
      }
      const entry = { ...(source as Record<string, unknown>) };
      const moment = Number(entry.moment);
      if (!Number.isInteger(moment) || moment < 1 || moment > candidate.moments.length) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.moment`, "visual moment is unavailable");
      }
      delete entry.moment;
      const rawContent = entry.content;
      if (!rawContent || typeof rawContent !== "object" || Array.isArray(rawContent)) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.content`, "visual content is required");
      }
      entry.course_visual = position;
      entry.content = { capability: visual.capability, ...(rawContent as Record<string, unknown>) };
      const entries = fixedCourseCreates.get(moment) ?? [];
      entries.push(entry);
      fixedCourseCreates.set(moment, entries);
    }
  }
  if (requireFixedReusableCreates
    && reusableBoardItemsToCreate.length > 0
    && candidate.reusable_board_creates === undefined) {
    throw new LessonPlanError(
      "LESSON_PLAN_REUSABLE",
      "$lessonPlanModelSection.reusable_board_creates",
      "the section must describe every outline-declared reusable board item in the required root object",
    );
  }
  const fixedReusableCreates = new Map<number, Record<"math_creates" | "note_creates", Array<Record<string, unknown>>>>();
  if (candidate.reusable_board_creates !== undefined) {
    if (!candidate.reusable_board_creates
      || typeof candidate.reusable_board_creates !== "object"
      || Array.isArray(candidate.reusable_board_creates)) {
      throw new LessonPlanError(
        "LESSON_PLAN_REUSABLE",
        "$lessonPlanModelSection.reusable_board_creates",
        "expected an object containing every required reusable board item",
      );
    }
    const supplied = candidate.reusable_board_creates as Record<string, unknown>;
    const expectedKeys = new Set(reusableBoardItemsToCreate.map(({ position }) => `item_${position}`));
    for (const key of Object.keys(supplied)) {
      if (!expectedKeys.has(key)) {
        throw new LessonPlanError(
          "LESSON_PLAN_REUSABLE",
          `$lessonPlanModelSection.reusable_board_creates.${key}`,
          "reusable board item is not declared for this section",
        );
      }
    }
    for (const { item, position } of reusableBoardItemsToCreate) {
      const key = `item_${position}`;
      const source = supplied[key];
      const entryPath = `$lessonPlanModelSection.reusable_board_creates.${key}`;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new LessonPlanError("LESSON_PLAN_REUSABLE", entryPath, "required reusable board item is missing");
      }
      const entry = { ...(source as Record<string, unknown>) };
      const moment = Number(entry.moment);
      if (!Number.isInteger(moment) || moment < 1 || moment > candidate.moments.length) {
        throw new LessonPlanError("LESSON_PLAN_REUSABLE", `${entryPath}.moment`, "reusable board item moment is unavailable");
      }
      delete entry.moment;
      entry.reusable_item = position;
      const collection = item.board_kind === "math"
        ? "math_creates"
        : item.board_kind === "note" ? "note_creates" : undefined;
      if (!collection) {
        throw new LessonPlanError(
          "LESSON_PLAN_REUSABLE",
          entryPath,
          `the staged model path cannot create a reusable ${String(item.board_kind)} board item`,
        );
      }
      const entries = fixedReusableCreates.get(moment) ?? { math_creates: [], note_creates: [] };
      entries[collection].push(entry);
      fixedReusableCreates.set(moment, entries);
    }
  }
  const createdCourseVisuals = new Set<number>();
  const momentKeys = new Set(["narration", "delivery", ...Object.keys(modelActionCollections)]);
  const moments = candidate.moments.map((momentValue, momentIndex) => {
    const path = `$lessonPlanModelSection.moments[${momentIndex}]`;
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) {
      throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", path, "expected an object");
    }
    const originalMoment = momentValue as Record<string, unknown>;
    if (candidate.course_visual_creates !== undefined
      && Array.isArray(originalMoment.visual_creates)
      && originalMoment.visual_creates.length > 0) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        `${path}.visual_creates`,
        "course visuals are created by the required root object, not by moment arrays",
      );
    }
    if (requireFixedReusableCreates
      && Array.isArray(originalMoment.visual_creates)
      && originalMoment.visual_creates.length > 0) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        `${path}.visual_creates`,
        "formal section generation cannot create course visuals through optional moment arrays",
      );
    }
    const moment: Record<string, unknown> = {
      ...originalMoment,
      ...(candidate.course_visual_creates === undefined ? {} : {
        visual_creates: fixedCourseCreates.get(momentIndex + 1) ?? [],
      }),
      ...(candidate.reusable_board_creates === undefined ? {} : {
        math_creates: [
          ...((originalMoment.math_creates as unknown[] | undefined) ?? []),
          ...(fixedReusableCreates.get(momentIndex + 1)?.math_creates ?? []),
        ],
        note_creates: [
          ...((originalMoment.note_creates as unknown[] | undefined) ?? []),
          ...(fixedReusableCreates.get(momentIndex + 1)?.note_creates ?? []),
        ],
      }),
    };
    for (const key of Object.keys(moment)) {
      if (!momentKeys.has(key)) throw new LessonPlanError("LESSON_PLAN_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
    }
    const ordered: Array<{ order: number; action: Record<string, unknown> }> = [];
    for (const [collectionName, descriptor] of Object.entries(modelActionCollections)) {
      const collection = moment[collectionName] ?? [];
      if (!Array.isArray(collection)) {
        throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", `${path}.${collectionName}`, "expected an array");
      }
      collection.forEach((entry, entryIndex) => {
        const entryPath = `${path}.${collectionName}[${entryIndex}]`;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", entryPath, "expected an object");
        }
        const action = {
          ...("kind" in descriptor ? { kind: descriptor.kind } : {}),
          ...(entry as Record<string, unknown>),
        };
        const order = ordered.length + 1;
        if (collectionName === "visual_creates" && courseVisualsToCreate.length > 0) {
          const visualPosition = Number(action.course_visual);
          const declaration = courseVisuals[visualPosition - 1];
          if (!Number.isInteger(visualPosition)
            || !declaration
            || declaration.create_section !== expectedSection) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.course_visual`, "visual position is not created by this section");
          }
          if (createdCourseVisuals.has(visualPosition)) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.course_visual`, "course visual is created more than once");
          }
          const content = action.content as Record<string, unknown> | undefined;
          if (!content || content.capability !== declaration.capability) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.content.capability`, "visual capability does not match its course position");
          }
          createdCourseVisuals.add(visualPosition);
          action.reusable_item = declaration.reusable_item;
          if (declaration.relation === "comparison") action.distinct_visual = true;
          delete action.course_visual;
        }
        ordered.push({
          order,
          action: {
            action: descriptor.action,
            ...lowerModelActionReferences(
              descriptor.action,
              action,
              momentIndex + 1,
              outline.numbers?.length ?? 0,
            ),
          },
        });
      });
    }
    ordered.sort((left, right) => left.order - right.order);
    if (ordered.length > 48) {
      throw new LessonPlanError("LESSON_PLAN_ACTIONS", `${path}.actions`, "expected at most 48 ordered actions");
    }
    return {
      narration: moment.narration,
      delivery: moment.delivery,
      actions: ordered.map((item) => item.action),
    };
  });
  for (const { position } of courseVisualsToCreate) {
    if (!createdCourseVisuals.has(position)) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        "$lessonPlanModelSection.moments",
        `course visual ${position} was not created`,
      );
    }
  }
  const activities: Array<{ order: number; activity: Record<string, unknown> }> = [];
  const collectActivities = (values: unknown[], kind: "number_target" | "scene3d_view", path: string): void => {
    values.forEach((activity, index) => {
      const itemPath = `${path}[${index}]`;
      if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
        throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", itemPath, "expected an object");
      }
      let lowered = { ...(activity as Record<string, unknown>) };
      const order = activities.length + 1;
      if (kind === "number_target" && lowered.reference !== undefined) {
        lowered.reference = lowerModelReference(lowered.reference, candidate.moments.length);
      }
      lowered = lowerModelActivityNumbers(lowered, kind, itemPath, outline, expectedSection);
      activities.push({ order, activity: { kind, ...lowered } });
    });
  };
  collectActivities(candidate.number_activities ?? [], "number_target", "$lessonPlanModelSection.number_activities");
  collectActivities(candidate.scene3d_activities ?? [], "scene3d_view", "$lessonPlanModelSection.scene3d_activities");
  activities.sort((left, right) => left.order - right.order);
  let latestBoardReference: Record<string, unknown> | undefined;
  let latestVisualReference: Record<string, unknown> | undefined;
  let latestVisualCapability: keyof typeof LESSON_PLAN_CAPABILITIES | undefined;
  for (let section = expectedSection - 1; section >= 1 && !latestBoardReference; section -= 1) {
    const reusableItems = outline.sections[section - 1]?.reusable_items ?? [];
    for (let item = reusableItems.length; item >= 1; item -= 1) {
      if (reusableItems[item - 1]?.kind === "board_item") {
        latestBoardReference = { source: "reusable", section, item };
        if (reusableItems[item - 1]?.board_kind === "visual") {
          latestVisualReference = structuredClone(latestBoardReference);
          latestVisualCapability = reusableItems[item - 1]?.capability;
        }
        break;
      }
    }
  }
  const localCounts: Array<Record<"local_board_item" | "local_connection" | "local_group", number>> = [];
  const localCapabilities = new Map<string, keyof typeof LESSON_PLAN_CAPABILITIES | undefined>();
  const currentReusableTargets = new Map<number, {
    reference: Record<string, unknown>;
    capability?: keyof typeof LESSON_PLAN_CAPABILITIES;
  }>();
  const activeVisualReferences = (): Record<string, unknown>[] => (
    courseVisuals.flatMap((visual) => {
      if (!visual.use_sections.includes(expectedSection)) return [];
      if (visual.create_section < expectedSection) {
        return [{
          source: "reusable",
          section: visual.create_section,
          item: visual.reusable_item,
        }];
      }
      const current = currentReusableTargets.get(visual.reusable_item)?.reference;
      return current ? [structuredClone(current)] : [];
    })
  );
  moments.forEach((moment, momentIndex) => {
    const currentCounts = { local_board_item: 0, local_connection: 0, local_group: 0 };
    const existingLocal = (value: unknown): boolean => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const reference = value as Record<string, unknown>;
      if (!["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) return true;
      const referencedMoment = Number(reference.moment);
      const item = Number(reference.item);
      const counts = referencedMoment === momentIndex + 1
        ? currentCounts
        : localCounts[referencedMoment - 1];
      return Number.isInteger(referencedMoment) && referencedMoment > 0
        && Number.isInteger(item) && item > 0
        && counts !== undefined
        && item <= counts[reference.source as keyof typeof counts];
    };
    const presentationReference = (value: unknown, preferVisual = false): unknown => {
      const original = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
      let reference = original ? { ...original } : undefined;
      let capability: keyof typeof LESSON_PLAN_CAPABILITIES | undefined;
      if (reference?.source === "reusable" && reference.section === expectedSection) {
        const mapped = currentReusableTargets.get(Number(reference.item));
        reference = mapped ? structuredClone(mapped.reference) : undefined;
        capability = mapped?.capability;
      } else if (reference?.source === "reusable") {
        const section = Number(reference.section);
        const item = Number(reference.item);
        const declaration = outline.sections[section - 1]?.reusable_items?.[item - 1];
        if (!declaration || section >= expectedSection) reference = undefined;
        else capability = declaration.capability;
      } else if (reference && ["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) {
        if (!existingLocal(reference)) reference = undefined;
        else if (reference.source === "local_board_item") {
          capability = localCapabilities.get(`${reference.moment}:${reference.item}`);
        }
      }
      const part = original?.part;
      const needsVisual = preferVisual || (part && typeof part === "object" && !Array.isArray(part)
        && (part as Record<string, unknown>).kind === "capability");
      if (!reference) {
        const fallback = needsVisual ? latestVisualReference : latestBoardReference;
        if (!fallback) return undefined;
        reference = structuredClone(fallback);
        capability = needsVisual ? latestVisualCapability : undefined;
      }
      if (needsVisual) {
        const role = part && typeof part === "object" && !Array.isArray(part)
          ? (part as Record<string, unknown>).role
          : undefined;
        if (capability && typeof role === "string" && LESSON_PLAN_CAPABILITIES[capability].includes(role)) {
          reference.part = part;
        } else {
          delete reference.part;
        }
      } else if (part !== undefined) {
        reference.part = part;
      }
      return reference;
    };
    const normalizedActions: Record<string, unknown>[] = [];
    const timingOrder = { before_speech: 0, during_speech: 1, after_speech: 2 } as const;
    const timingName = ["before_speech", "during_speech", "after_speech"] as const;
    moment.actions.forEach((action) => {
      if (action.action === "create") {
        const placement = action.placement && typeof action.placement === "object" && !Array.isArray(action.placement)
          ? { ...(action.placement as Record<string, unknown>) }
          : { relation: "new_region" };
        delete placement.reference;
        if (placement.relation !== "new_region" && latestBoardReference) {
          placement.reference = structuredClone(latestBoardReference);
          if (latestBoardReference.source === "local_board_item"
            && latestBoardReference.moment === momentIndex + 1) {
            const previousAction = normalizedActions.findLast((candidate) => candidate.action === "create");
            const previousRank = previousAction?.timing && previousAction.timing in timingOrder
              ? timingOrder[previousAction.timing as keyof typeof timingOrder]
              : 0;
            const currentRank = action.timing && action.timing in timingOrder
              ? timingOrder[action.timing as keyof typeof timingOrder]
              : 0;
            if (currentRank < previousRank) action.timing = timingName[previousRank];
          }
        } else if (placement.relation !== "new_region") {
          placement.relation = "new_region";
        }
        action.placement = placement;
        currentCounts.local_board_item += 1;
        latestBoardReference = {
          source: "local_board_item",
          moment: momentIndex + 1,
          item: currentCounts.local_board_item,
        };
        const capability = action.kind === "visual"
          && action.content && typeof action.content === "object" && !Array.isArray(action.content)
          && typeof (action.content as Record<string, unknown>).capability === "string"
          && (action.content as Record<string, unknown>).capability! in LESSON_PLAN_CAPABILITIES
          ? (action.content as Record<string, unknown>).capability as keyof typeof LESSON_PLAN_CAPABILITIES
          : undefined;
        localCapabilities.set(`${momentIndex + 1}:${currentCounts.local_board_item}`, capability);
        if (Number.isInteger(action.reusable_item) && Number(action.reusable_item) > 0) {
          currentReusableTargets.set(Number(action.reusable_item), {
            reference: structuredClone(latestBoardReference),
            ...(capability ? { capability } : {}),
          });
        }
        if (capability) {
          latestVisualReference = structuredClone(latestBoardReference);
          latestVisualCapability = capability;
        }
      } else if (action.action === "emphasize" || action.action === "point_at") {
        const reference = presentationReference(action.reference, action.action === "point_at");
        if (reference === undefined) return;
        action.reference = reference;
      } else if (action.action === "focus") {
        const supplied = Array.isArray(action.references)
          ? action.references.map((reference) => presentationReference(reference)).filter((reference) => reference !== undefined)
          : [];
        const references = supplied.length > 0
          ? supplied
          : activeVisualReferences().length > 0
            ? activeVisualReferences()
            : [latestVisualReference ?? latestBoardReference].filter((reference) => reference !== undefined);
        const unique = [...new Map(references.map((reference) => [JSON.stringify(reference), reference])).values()];
        if (unique.length === 0) return;
        action.references = unique;
      }
      normalizedActions.push(action);
      if (action.action === "connect") currentCounts.local_connection += 1;
      if (action.action === "group") currentCounts.local_group += 1;
    });
    moment.actions = normalizedActions;
    if (moment.actions.length === 0 && latestBoardReference) {
      moment.actions.push({
        action: "focus",
        references: [structuredClone(latestBoardReference)],
        intent: "继续观察当前画面",
        timing: "after_speech",
      });
    }
    localCounts.push(currentCounts);
  });
  const sceneCapabilities = new Set(LESSON_PLAN_CAPABILITY_NAMES.filter((capability) => (
    LESSON_PLAN_CAPABILITY_REGISTRY[capability].output_kinds.includes("scene3d" as never)
  )));
  let sceneReference: Record<string, unknown> | undefined;
  for (const [item, target] of [...currentReusableTargets.entries()].reverse()) {
    if (target.capability && sceneCapabilities.has(target.capability)) {
      void item;
      sceneReference = structuredClone(target.reference);
      break;
    }
  }
  if (!sceneReference) {
    for (const [key, capability] of [...localCapabilities.entries()].reverse()) {
      if (!capability || !sceneCapabilities.has(capability)) continue;
      const [moment, item] = key.split(":").map(Number);
      sceneReference = { source: "local_board_item", moment, item };
      break;
    }
  }
  if (!sceneReference) {
    for (let section = expectedSection - 1; section >= 1 && !sceneReference; section -= 1) {
      const reusableItems = outline.sections[section - 1]?.reusable_items ?? [];
      for (let item = reusableItems.length; item >= 1; item -= 1) {
        const declaration = reusableItems[item - 1];
        if (declaration.capability && sceneCapabilities.has(declaration.capability)) {
          sceneReference = { source: "reusable", section, item };
          break;
        }
      }
    }
  }
  for (const item of activities) {
    if (item.activity.kind !== "scene3d_view") continue;
    if (!sceneReference) {
      throw new LessonPlanError(
        "LESSON_PLAN_ACTIVITY",
        "$lessonPlanModelSection.scene3d_activities",
        "a 3D view activity requires an existing 3D visual",
      );
    }
    item.activity.reference = structuredClone(sceneReference);
  }
  return {
    version: candidate.version as LessonPlanSectionDraft["version"],
    section: candidate.section as number,
    moments: moments as LessonPlanSectionDraft["moments"],
    student_activities: activities.map((item) => item.activity) as LessonPlanSectionDraft["student_activities"],
  };
}

function inputContext(input: LessonPlanGenerationInput): Record<string, unknown> {
  if (!input.turn_id.trim()) throw new Error("turn_id is required");
  if (!input.learner_request.trim()) throw new Error("learner_request is required");
  return {
    learner_request: input.learner_request,
    input_modality: input.input_modality ?? null,
    language: input.language ?? "zh-CN",
    learner_context: input.learner_context ?? null,
    tutor_context: input.tutor_context ?? null,
  };
}

const requestSentenceBoundary = /(?:\r?\n+|[。！？!?；;]+)/u;
const requestSequenceBoundary = /[，,]\s*(?=(?:再(?:请|用|展示|说明|解释|让|给|比较|演示|带|分析|推导|证明)|然后|接着|最后|随后|同时|并且|并请|并让|还要|另外|此外))/u;

function cleanRequestPart(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * Produces stable source fragments for coverage checks without asking another
 * model and without using subject-specific keywords. The split is deliberately
 * conservative: ordinary conjunctions such as “单位圆和正弦图” stay together;
 * sentence boundaries and explicit sequencing phrases start a new requirement.
 */
export function deriveLessonRequestParts(learnerRequest: string): string[] {
  const source = cleanRequestPart(learnerRequest);
  if (!source) throw new Error("learner_request is required");
  const parts = source
    .split(requestSentenceBoundary)
    .flatMap((sentence) => sentence.split(requestSequenceBoundary))
    .map(cleanRequestPart)
    .filter(Boolean);
  if (parts.length <= 64) return parts;
  return [...parts.slice(0, 63), parts.slice(63).join("；")];
}

function requestParts(input: LessonPlanGenerationInput): string[] {
  const parts = input.request_parts ?? deriveLessonRequestParts(input.learner_request);
  if (parts.length === 0 || parts.length > 64) throw new Error("request_parts must contain 1 to 64 items");
  return parts.map((part, index) => {
    if (typeof part !== "string" || !part.trim()) throw new Error(`request_parts[${index}] must be non-empty`);
    return part;
  });
}

function sectionIndexFromError(error: unknown, sectionCount: number): number | undefined {
  if (!(error instanceof LessonPlanError)) return undefined;
  const draftMatch = error.path.match(/\$lessonPlanSectionDrafts\[(\d+)\]/u);
  const planMatch = error.path.match(/\$lessonPlan\.sections\[(\d+)\]/u);
  const offset = Number(draftMatch?.[1] ?? planMatch?.[1]);
  return Number.isInteger(offset) && offset >= 0 && offset < sectionCount ? offset + 1 : undefined;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b429\b|RESOURCE_EXHAUSTED|rate[ _-]?limit)/iu.test(message);
}

function isBoundedModelResponseFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "VERTEX_RESPONSE_TRUNCATED"
    || code === "VERTEX_RESPONSE_EMPTY"
    || code === "VERTEX_REQUEST_TIMEOUT";
}

function compilePrefix(
  outline: LessonPlanOutline,
  drafts: LessonPlanSectionDraft[],
  options: CompileLessonPlanOptions | undefined,
): CompiledLessonPlan {
  const sectionCount = drafts.length;
  let focus: { source: "reusable"; section: number; item: number } | undefined;
  for (let section = sectionCount; section >= 1 && !focus; section -= 1) {
    const items = outline.sections[section - 1]?.reusable_items ?? [];
    if (items.length > 0) focus = { source: "reusable", section, item: items.length };
  }
  if (!focus) {
    throw new LessonPlanError(
      "LESSON_PLAN_PROGRESSIVE_FOCUS",
      "$lessonPlanOutline.sections[0].reusable_items",
      "the first playable prefix requires at least one declared reusable item",
    );
  }
  const prefixOutlineBase = structuredClone(outline);
  delete prefixOutlineBase.request_coverage;
  // Section drafts have already been lowered to concrete reusable-item
  // positions. course_visuals constrains authoring of the complete course, but
  // its future use_sections are deliberately outside a progressive prefix.
  // Keeping that complete list would make an otherwise valid prefix fail only
  // because its later sections have not arrived yet.
  delete prefixOutlineBase.course_visuals;
  const prefixOutline: LessonPlanOutline = {
    ...prefixOutlineBase,
    sections: structuredClone(outline.sections.slice(0, sectionCount)),
    close: { summary: "课程内容仍在继续生成。", focus: [focus] },
  };
  const normalized = normalizeExecutableNumberInteractions(prefixOutline, drafts);
  const prefixPlan = assembleLessonPlan(normalized.outline, normalized.drafts, options);
  return compileAndValidateLessonPlan(prefixPlan, options);
}

export async function generateLessonPlanWithModel(
  model: LessonPlanModelCall,
  input: LessonPlanGenerationInput,
  options: GenerateLessonPlanOptions = {},
): Promise<LessonPlanGenerationResult> {
  const maxAttempts = positiveInteger(options.max_attempts_per_part, 3, "max_attempts_per_part");
  const concurrency = positiveInteger(options.max_concurrency, 1, "max_concurrency");
  const firstPlayableTimeout = positiveInteger(
    options.first_playable_timeout_ms,
    LESSON_PLAN_FIRST_PLAYABLE_TIMEOUT_MS,
    "first_playable_timeout_ms",
  );
  const firstPlayableStartedAt = Date.now();
  const firstPlayablePartTimeout = (): number => {
    const remaining = firstPlayableTimeout - (Date.now() - firstPlayableStartedAt);
    if (remaining < 1) {
      throw new LessonPlanError(
        "LESSON_PLAN_FIRST_PLAYABLE_TIMEOUT",
        "$lessonPlan.first_playable",
        `the first playable section exceeded ${firstPlayableTimeout}ms`,
      );
    }
    return Math.min(LESSON_PLAN_MODEL_PART_TIMEOUT_MS, remaining);
  };
  const context = inputContext(input);
  const fixedRequestParts = requestParts(input);
  const bootstrapFirstSection = options.bootstrap_first_section === true;
  const admissionInput = input.input_modality === "voice" || input.input_modality === "text";
  if (admissionInput && !bootstrapFirstSection) {
    throw new Error("lesson admission requires bootstrap_first_section");
  }
  let modelCalls = 0;
  let outline: LessonPlanOutline | undefined;
  let bootstrappedFirstSection: LessonPlanSectionDraft | undefined;
  let outlineError: unknown;
  let tryCombinedBootstrap = bootstrapFirstSection;
  const sectionErrors = new Map<number, unknown>();
  const sectionAttempts = new Map<number, number>();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const combinedBootstrap = tryCombinedBootstrap;
    const responseUsesEnvelope = combinedBootstrap || admissionInput;
    let raw: string;
    try {
      raw = await model({
        label: combinedBootstrap ? "lesson-plan-bootstrap" : "lesson-plan-outline",
        part: combinedBootstrap ? "bootstrap" : "outline",
        attempt,
        turn_id: input.turn_id,
        system_prompt: combinedBootstrap
          ? admissionInput ? ADMISSION_BOOTSTRAP_SYSTEM_PROMPT : BOOTSTRAP_SYSTEM_PROMPT
          : admissionInput ? ADMISSION_OUTLINE_SYSTEM_PROMPT : OUTLINE_SYSTEM_PROMPT,
        prompt: JSON.stringify({
          course: context,
          request_parts: fixedRequestParts.map((text, index) => ({ request_part: index + 1, text })),
          available_visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability) => ({
            required_features: [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].required_features],
            number_inputs: [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs],
            guidance: LESSON_PLAN_CAPABILITY_REGISTRY[capability].model_guidance,
          })),
          ...(combinedBootstrap ? {
            first_section_to_write: 1,
            first_section_rule: "first_section must implement outline.sections[0]; the program assigns visual and reusable-item positions",
          } : {}),
          ...(outlineError ? { previous_validation_error: errorFeedback(outlineError) } : {}),
        }),
        response_schema: combinedBootstrap
          ? admissionInput
            ? buildLessonPlanAdmissionBootstrapJsonSchema(fixedRequestParts.length)
            : buildLessonPlanBootstrapJsonSchema(fixedRequestParts.length)
          : admissionInput
            ? buildLessonPlanAdmissionOutlineJsonSchema(fixedRequestParts.length)
            : buildLessonPlanOutlineJsonSchema(fixedRequestParts.length),
        max_output_tokens: combinedBootstrap
          ? LESSON_PLAN_BOOTSTRAP_MAX_OUTPUT_TOKENS
          : LESSON_PLAN_OUTLINE_MAX_OUTPUT_TOKENS,
        timeout_ms: firstPlayablePartTimeout(),
      });
      modelCalls += 1;
    } catch (error) {
      if (!isBoundedModelResponseFailure(error)) throw error;
      modelCalls += 1;
      outlineError = error;
      await options.on_rejected_part?.({
        label: "lesson-plan-outline",
        attempt,
        error: rejectionDetails(error),
      });
      // The combined request is an optional latency optimization. Repeating
      // the same all-capabilities first-section schema after a bounded-output
      // failure recreates the same long-tail risk. Recover with the smaller
      // outline-only schema; the first section will then use the exact schema
      // derived from that validated outline.
      if (combinedBootstrap) tryCombinedBootstrap = false;
      if (attempt === maxAttempts) throw error;
      continue;
    }
    try {
      const parsed = pruneModelNulls(parseModelJson(raw, responseUsesEnvelope
        ? "lessonPlanEnvelope"
        : "lessonPlanOutline"));
      if (responseUsesEnvelope && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanEnvelope",
          "lesson response envelope must be an object",
        );
      }
      if (admissionInput) {
        const envelope = parsed as Record<string, unknown>;
        const disposition = envelope.disposition;
        if (disposition !== "generate_lesson" && disposition !== "clarify" && disposition !== "ignore") {
          throw new LessonPlanError(
            "LESSON_PLAN_MODEL_JSON",
            "$lessonPlanBootstrap.disposition",
            "lesson bootstrap must choose generate_lesson, clarify, or ignore",
          );
        }
        if (disposition !== "generate_lesson") {
          const learnerResponse = typeof envelope.learner_response === "string"
            ? envelope.learner_response.trim()
            : "";
          if (disposition === "clarify" && !learnerResponse) {
            throw new LessonPlanError(
              "LESSON_PLAN_MODEL_JSON",
              "$lessonPlanBootstrap.learner_response",
              "clarify requires a learner-facing question",
            );
          }
          return {
            disposition,
            learner_response: learnerResponse,
            model_calls: modelCalls,
          };
        }
      }
      const rawOutline = responseUsesEnvelope
        ? (parsed as Record<string, unknown>).outline
        : parsed;
      outline = validateLessonPlanOutline(
        lowerModelOutline(
          coerceLessonPlanOutlineModelNumbers(
            rawOutline,
            fixedRequestParts.length,
          ),
        ),
        fixedRequestParts.length,
      );
      if (combinedBootstrap) {
        try {
          const positionedFirstSection = reconcileBootstrapFirstSectionPositions(
            coerceLessonPlanBootstrapSectionModelNumbers(
              (parsed as Record<string, unknown>).first_section,
            ),
            outline,
          );
          reconcileBootstrapReusableDeclarations(positionedFirstSection, outline);
          outline = validateLessonPlanOutline(outline, fixedRequestParts.length);
          bootstrappedFirstSection = lowerModelSectionDraft(
            positionedFirstSection,
            outline,
            1,
          );
        } catch (error) {
          // The combined outline + first-section response is a latency
          // optimization. An invalid speculative first section must not spend
          // one of the formal section-generation attempts.
          sectionErrors.set(1, error);
          await options.on_rejected_part?.({
            label: "lesson-plan-section",
            section: 1,
            attempt: 1,
            error: rejectionDetails(error),
          });
        }
      }
      break;
    } catch (error) {
      outlineError = error;
      await options.on_rejected_part?.({
        label: "lesson-plan-outline",
        attempt,
        error: rejectionDetails(error),
      });
      if (combinedBootstrap) tryCombinedBootstrap = false;
    }
  }
  if (!outline) throw outlineError;
  const unsupported = outline.request_coverage?.find((item) => item.treatment === "unsupported");
  if (unsupported) {
    throw new LessonPlanError(
      "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
      `$lessonPlanOutline.request_coverage[${outline.request_coverage!.indexOf(unsupported)}]`,
      unsupported.reason ?? `request part ${unsupported.request_part} is unsupported`,
    );
  }

  const generateSection = async (section: number): Promise<LessonPlanSectionDraft> => {
    const attempt = (sectionAttempts.get(section) ?? 0) + 1;
    sectionAttempts.set(section, attempt);
    if (attempt > maxAttempts) throw sectionErrors.get(section);
    let raw: string;
    try {
      raw = await model({
        label: "lesson-plan-section",
        part: "section",
        section,
        attempt,
        turn_id: input.turn_id,
        system_prompt: SECTION_SYSTEM_PROMPT,
        prompt: JSON.stringify({
          course: context,
          immutable_outline: outline,
          section_to_write: section,
          visuals_for_section: (outline.course_visuals ?? []).flatMap((visual, index) => {
            if (!visual.use_sections.includes(section)) return [];
            return [{
              course_visual: index + 1,
              capability: visual.capability,
              mode: visual.create_section === section ? "create" : "reuse",
              relation: visual.relation,
              ...(visual.related_visual === undefined ? {} : { related_visual: visual.related_visual }),
              reference: {
                source: "reusable",
                section: visual.create_section,
                item: visual.reusable_item,
                host_reference: 0,
                moment: 0,
              },
            }];
          }),
          assigned_request_parts: (outline.request_coverage ?? [])
            .filter((item) => item.treatment === "teach" && item.sections.includes(section))
            .map((item) => ({
              request_part: item.request_part,
              text: fixedRequestParts[item.request_part - 1],
            })),
          ...(sectionErrors.has(section)
            ? { previous_validation_error: errorFeedback(sectionErrors.get(section)) }
            : {}),
        }),
        response_schema: buildLessonPlanSectionDraftJsonSchema(outline, section),
        max_output_tokens: LESSON_PLAN_SECTION_MAX_OUTPUT_TOKENS,
        timeout_ms: section === 1
          ? firstPlayablePartTimeout()
          : LESSON_PLAN_MODEL_PART_TIMEOUT_MS,
      });
      modelCalls += 1;
    } catch (error) {
      if (isBoundedModelResponseFailure(error)) {
        modelCalls += 1;
        sectionErrors.set(section, error);
        await options.on_rejected_part?.({
          label: "lesson-plan-section",
          section,
          attempt,
          error: rejectionDetails(error),
        });
        if (attempt >= maxAttempts) throw error;
        return generateSection(section);
      }
      // Provider quota and transport failures are not semantic authoring
      // attempts. They must not consume the section's repair budget.
      sectionAttempts.set(section, attempt - 1);
      throw error;
    }
    let candidate: LessonPlanSectionDraft;
    try {
      candidate = lowerModelSectionDraft(
        coerceLessonPlanSectionModelNumbers(
          pruneModelNulls(parseModelJson(raw, `lessonPlanSection${section}`)),
          outline,
          section,
        ),
        outline,
        section,
        true,
      );
    } catch (error) {
      sectionErrors.set(section, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section,
        attempt,
        error: rejectionDetails(error),
      });
      return generateSection(section);
    }
    return candidate;
  };

  const drafts: LessonPlanSectionDraft[] = [];
  const acceptSection = async (
    section: number,
    initialCandidate?: LessonPlanSectionDraft,
  ): Promise<void> => {
    let candidate = initialCandidate;
    while (true) {
      candidate ??= await generateSection(section);
      drafts[section - 1] = candidate;
      try {
        const prefix = compilePrefix(outline, drafts.slice(0, section), options.compile);
        await options.on_playable_prefix?.({ completed_sections: section, compiled: prefix });
        return;
      } catch (error) {
        if ((sectionAttempts.get(section) ?? 0) >= maxAttempts) throw error;
        sectionErrors.set(section, error);
        await options.on_rejected_part?.({
          label: "lesson-plan-section",
          section,
          attempt: sectionAttempts.get(section) ?? 1,
          error: rejectionDetails(error),
        });
        candidate = undefined;
      }
    }
  };

  // The first section remains the latency-critical path and is published
  // before any later-section work can delay it.
  await acceptSection(1, bootstrappedFirstSection);

  if (outline.sections.length > 1 && concurrency === 1) {
    for (let section = 2; section <= outline.sections.length; section += 1) {
      await acceptSection(section);
    }
  } else if (outline.sections.length > 1) {
    type ConcurrentResult =
      | { ok: true; draft: LessonPlanSectionDraft }
      | { ok: false; error: unknown };
    const pending = new Map<number, Promise<ConcurrentResult>>();
    const resolvePending = new Map<number, (result: ConcurrentResult) => void>();
    const settled = new Map<number, ConcurrentResult>();
    for (let section = 2; section <= outline.sections.length; section += 1) {
      pending.set(section, new Promise((resolve) => resolvePending.set(section, resolve)));
    }
    let nextSection = 2;
    let stopScheduling = false;
    const worker = async (): Promise<void> => {
      while (!stopScheduling && nextSection <= outline.sections.length) {
        const section = nextSection;
        nextSection += 1;
        try {
          const result: ConcurrentResult = { ok: true, draft: await generateSection(section) };
          settled.set(section, result);
          resolvePending.get(section)?.(result);
        } catch (error) {
          if (isRateLimitError(error)) stopScheduling = true;
          const result: ConcurrentResult = { ok: false, error };
          settled.set(section, result);
          resolvePending.get(section)?.(result);
          if (!isRateLimitError(error)) stopScheduling = true;
        }
      }
    };
    const workers = Array.from(
      { length: Math.min(concurrency, outline.sections.length - 1) },
      () => worker(),
    );
    let sequentialFallback = false;
    for (let section = 2; section <= outline.sections.length; section += 1) {
      if (sequentialFallback) {
        const completed = settled.get(section);
        await acceptSection(section, completed?.ok ? completed.draft : undefined);
        continue;
      }
      const result = await pending.get(section)!;
      if (result.ok) {
        await acceptSection(section, result.draft);
        continue;
      }
      if (!isRateLimitError(result.error)) {
        stopScheduling = true;
        await Promise.allSettled(workers);
        throw result.error;
      }
      // A paid or trial project can still hit a short concurrency quota. Wait
      // for the in-flight request to settle, then finish the remaining
      // sections one at a time without discarding any completed draft.
      stopScheduling = true;
      await Promise.allSettled(workers);
      sequentialFallback = true;
      await options.on_concurrency_fallback?.({ section, reason: "rate_limited" });
      await acceptSection(section);
    }
    stopScheduling = true;
    await Promise.allSettled(workers);
  }
  let compiled: CompiledLessonPlan | undefined;
  let compiledOutline: LessonPlanOutline | undefined;
  let compiledDrafts: LessonPlanSectionDraft[] | undefined;
  let finalError: unknown;
  for (let attempt = 1; attempt <= outline.sections.length * maxAttempts; attempt += 1) {
    try {
      const normalized = normalizeExecutableNumberInteractions(outline, drafts);
      const plan = assembleLessonPlan(normalized.outline, normalized.drafts, options.compile);
      compiled = compileAndValidateLessonPlan(plan, options.compile);
      compiledOutline = normalized.outline;
      compiledDrafts = normalized.drafts;
      break;
    } catch (error) {
      finalError = error;
      const section = sectionIndexFromError(error, outline.sections.length);
      if (!section || (sectionAttempts.get(section) ?? 0) >= maxAttempts) throw error;
      sectionErrors.set(section, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section,
        attempt: sectionAttempts.get(section) ?? 1,
        error: rejectionDetails(error),
      });
      drafts[section - 1] = await generateSection(section);
    }
  }
  if (!compiled) throw finalError;
  return {
    ...compiled,
    outline: compiledOutline ?? outline,
    drafts: (compiledDrafts ?? drafts).map((draft) => structuredClone(draft)),
    model_calls: modelCalls,
  };
}
