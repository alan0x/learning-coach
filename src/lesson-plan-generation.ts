import {
  LESSON_PLAN_CAPABILITY_NAMES,
  LESSON_PLAN_CAPABILITY_NUMBER_LIMITS,
  LESSON_PLAN_CAPABILITY_REGISTRY,
  PROCESS_DIAGRAM_CONTRACT,
  LESSON_PLAN_CAPABILITIES,
  LESSON_PLAN_VISUAL_FEATURES,
  LESSON_PLAN_VERSION,
  LessonPlanError,
  assembleLessonPlan,
  matchLessonPlanCapability,
  validateLessonPlanOutline,
  type LessonPlanOutline,
  type LessonPlanAction,
  type LessonPlanMathExpression,
  type LessonPlanReference,
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
  buildLessonPlanAdmissionBootstrapJsonSchema,
  buildLessonPlanAdmissionOutlineJsonSchema,
  buildCameraLessonPlanAdmissionBootstrapJsonSchema,
  buildCameraLessonPlanAdmissionOutlineJsonSchema,
  buildLessonPlanBootstrapJsonSchema,
  buildLessonPlanOutlineJsonSchema,
  buildLessonPlanSectionDraftJsonSchema,
  coerceLessonPlanBootstrapSectionModelNumbers,
  coerceLessonPlanOutlineModelNumbers,
  coerceLessonPlanSectionModelNumbers,
  LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES,
  LESSON_PLAN_VISUAL_PARAMETER_NAMES,
  type LessonPlanJsonSchema,
} from "./lesson-plan-schema.js";
import { completedJsonObjectProperty } from "./json-stream.js";

export interface LessonPlanGenerationInput {
  turn_id: string;
  learner_request: string;
  language?: string;
  learner_context?: string;
  tutor_context?: string;
  request_parts?: string[];
  input_modality?: "text" | "voice";
  camera_input?: boolean;
}

export interface CameraLessonObservation {
  readability: "readable" | "partially_readable" | "unreadable";
  observed_content: string;
  uncertainties: string[];
}

export interface LessonPlanModelRequest {
  label: "lesson-plan-bootstrap" | "lesson-plan-outline" | "lesson-plan-section";
  turn_id: string;
  system_prompt: string;
  prompt: string;
  response_schema: LessonPlanJsonSchema;
  part: "bootstrap" | "outline" | "section";
  section?: number;
  attempt: number;
  include_camera_media?: boolean;
}

export type LessonPlanModelCall = (request: LessonPlanModelRequest) => Promise<string>;

export interface GenerateLessonPlanOptions {
  max_attempts_per_part?: number;
  compile?: CompileLessonPlanOptions;
  on_outline_ready?: (event: {
    sections: number;
    course_visuals: number;
    request_parts: number;
    camera_observation: boolean;
  }) => void | Promise<void>;
  on_playable_prefix?: (event: {
    completed_sections: number;
    compiled: CompiledLessonPlan;
  }) => void | Promise<void>;
  on_rejected_part?: (event: {
    label: "lesson-plan-bootstrap" | "lesson-plan-outline" | "lesson-plan-section";
    attempt: number;
    section?: number;
    error: { code: string; path?: string; message: string };
  }) => void | Promise<void>;
  on_program_adjustment?: (event: {
    kind: "visual_removed" | "duplicate_board_item_removed";
    section: number;
    capability?: keyof typeof LESSON_PLAN_CAPABILITIES;
    moment?: number;
    board_kind?: "math" | "note";
    reason: string;
  }) => void | Promise<void>;
}

export interface GeneratedLessonPlan extends CompiledLessonPlan {
  outline: LessonPlanOutline;
  drafts: LessonPlanSectionDraft[];
  model_calls: number;
  camera_observation?: CameraLessonObservation;
}

export interface NonLessonPlanResponse {
  disposition: "clarify" | "ignore" | "unsupported";
  learner_response: string;
  model_calls: number;
}

export type LessonPlanGenerationResult = GeneratedLessonPlan | NonLessonPlanResponse;

const OUTLINE_SYSTEM_PROMPT = `设计完整课程目录，不生成 OLL、执行 ID、组件名或自由对象名。
- visual_recipes 每项依次是 [features, numbers, purpose]。course_visuals 只列真正需要的主要画面并选择其中的 features；同一画面后续复用，只有确需并排比较才建 comparison，supporting/comparison 都指向较早画面。
- 图形拆分移动证明使用 polygon_pieces、rigid_rearrangement、area_relation；ordered_process_steps 只是静态流程。
- numbers 只写有教学作用的共享数值、范围和初值，顺序依 visual_recipes 的 numbers；控件与步长由程序生成。
- request_coverage 按 request_parts 的原顺序逐项覆盖。可落实写 teach 和章节；当前能力不能完整实现则写 unsupported、空章节和原因，不能用文字或错误画面替代。
- sections 可含多节，每节可有旁白、板书、动画和练习；close 只总结。
只返回符合响应 Schema 的 JSON。`;

const SECTION_SYSTEM_PROMPT = `只编写课程目录指定的一节，不生成 OLL、执行 ID、变量名、对象名或对象引用。
- 必须落实目录分配的 request_parts。旁白与对应板书和动作放在同一 moment；可见文字直接对学习者说话，不能写“让学生……”。
- 目录中本节 create 的画面按顺序写入 course_visual_creates 并指定 moment；reuse 的画面不得重建。目录声明的公式和笔记分别按顺序写入 reusable_math_creates、reusable_note_creates；空清单省略。
- focuses 只写聚焦意图，points 只表示需要指示；程序选择真实对象，补齐卡片用途、位置、默认时机和动作顺序。
- 小数按 Schema 的 mantissa、scale 填写，例如 -1.5 为 -15、1；6.283 为 6283、3。
- number_activities 只选数值位置和目标值；scene3d_activities 只选预设视角。控件、容差、提示出现次数、相机和运行时引用由程序生成。
- function_plot 的 parameters.formulas 始终是公式数组，每项只写中缀公式右侧：x 是横轴，n1、n2 是课程第 1、2 个数值；支持 + - * / ^、括号、pi、e 和常见单参数函数。单条曲线可引用 n1、n2，例如 (x-n1)^2+n2；比较多条曲线时填写多个不含 n1、n2 的静态公式，例如 ["x", "x^2", "sin(x)"]。每条公式都必须依赖 x；程序逐条解析、绑定控件并计算坐标范围。函数图和三维曲面都不填写视窗、采样密度或网格精度。
- animations 只决定演示哪个数值、目标值和教学节奏；程序统一生成缓动方式。
- geometric_rearrangement 的数值表示重排进度；construction 从 Schema 选择。process_diagram 没有数值或动画。
只返回符合响应 Schema 的 JSON。`;

const BOOTSTRAP_FIRST_SECTION_PROMPT = `在同一次回答中，必须先完成 outline，再依据这个 outline 编写 first_section。first_section 只能落实 outline.sections[0]：
- outline 是唯一课程安排；不得在 first_section 增加 outline 没有声明的主要画面，也不得遗漏第一节声明的主要画面和可复用板书。
- first_section 只写 moments 以及可选的 number_activities、scene3d_activities。旁白与对应板书和动作放在同一 moment；可见文字直接对学习者说话，不能写“让学生……”。
- outline 中第一节新建的主要画面，按 course_visuals 的位置写进对应 moment 的 visual_creates：course_visual 填其从 1 开始的位置，content.parameters 只填写该画面所需的数学内容，content.numbers 使用 outline.numbers 的位置。画面能力由程序根据 outline.required_features 确定，first_section 不再重复选择。不得重建 outline 声明为复用的旧画面。
- outline 中第一节声明的可复用公式和笔记，按 reusable_items 的位置写进对应 moment 的 math_creates 和 note_creates，并用 reusable_item 填其从 1 开始的位置；其他只在当前讲解中出现的公式或笔记也可写入这两个数组，但不填 reusable_item。程序把位置转换为稳定引用。
- first_section 使用 outline 中数值和画面的先后顺序，不生成 OLL、执行 ID、变量名、对象名、对象引用、course_visual_creates 或 reusable_board_creates。
- focuses 只写聚焦意图，points 只表示需要指示；程序选择真实对象，补齐卡片用途、位置、默认时机和动作顺序。
- 小数按 Schema 的 mantissa、scale 填写，例如 -1.5 为 -15、1；6.283 为 6283、3。
- number_activities 只选数值位置和目标值；scene3d_activities 只选预设视角。控件、容差、提示出现次数、相机和运行时引用由程序生成。
- function_plot 的 parameters.formulas 始终是公式数组，每项只写中缀公式右侧：x 是横轴，n1、n2 是课程第 1、2 个数值；支持 + - * / ^、括号、pi、e 和常见单参数函数。单条曲线可引用 n1、n2，例如 (x-n1)^2+n2；比较多条曲线时填写多个不含 n1、n2 的静态公式，例如 ["x", "x^2", "sin(x)"]。每条公式都必须依赖 x；程序逐条解析、绑定控件并计算坐标范围。函数图和三维曲面都不填写视窗、采样密度或网格精度。
- animations 只决定演示哪个数值、目标值和教学节奏；程序统一生成缓动方式。
- geometric_rearrangement 的数值表示重排进度；construction 从 Schema 选择。process_diagram 没有数值或动画。`;

const BOOTSTRAP_SYSTEM_PROMPT = `${OUTLINE_SYSTEM_PROMPT}

${BOOTSTRAP_FIRST_SECTION_PROMPT}

只返回符合响应 Schema 的 JSON。`;

const ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `用户正尝试从文字输入或语音输入开始一整节白板课程。先判断当前内容是否足以确定课程主题，不要从可用画面或数学能力猜测用户没有表达的主题。
- generate_lesson：用户提出了学习问题、解释请求，或清楚说出了想学习的主题。简短但明确的主题（例如“勾股定理”）也属于这一类。此时 course 必须同时包含完整 outline 和 first_section，learner_response 留空。
- clarify：这是真实话语，但内容残缺、含义不清或没有说明要学什么，无法可靠确定课程主题。此时 course 必须为 null，用 learner_response 简短追问用户想学习什么。例如 “The book.” 应追问用户想了解这本书的什么内容，而不是猜成数学课程。
- ignore：只是语气词、口头填充或没有可回应内容。此时 course 必须为 null，learner_response 留空。
只做上述语义判断，不使用字数、语言或固定关键词作为规则。

${BOOTSTRAP_SYSTEM_PROMPT}`;

const ADMISSION_OUTLINE_SYSTEM_PROMPT = `用户正尝试从文字输入或语音输入开始一整节白板课程。先判断当前内容是否足以确定课程主题，不要从可用画面或数学能力猜测用户没有表达的主题。
- generate_lesson：用户提出了学习问题、解释请求，或清楚说出了想学习的主题。简短但明确的主题（例如“勾股定理”）也属于这一类。此时 course 必须包含完整课程目录，learner_response 留空。不要生成任何一节的旁白或板书内容。
- clarify：这是真实话语，但内容残缺、含义不清或没有说明要学什么，无法可靠确定课程主题。此时 course 必须为 null，用 learner_response 简短追问用户想学习什么。例如 “The book.” 应追问用户想了解这本书的什么内容，而不是猜成数学课程。
- ignore：只是语气词、口头填充或没有可回应内容。此时 course 必须为 null，learner_response 留空。
只做上述语义判断，不使用字数、语言或固定关键词作为规则。

${OUTLINE_SYSTEM_PROMPT}`;

const CAMERA_ADMISSION_OUTLINE_SYSTEM_PROMPT = `用户提交了一段文字或语音，同时附带了一张此刻的摄像头画面。只在这一次请求中读取图片。
- image_observation 必须忠实记录图片是否看清、实际看到了什么、哪些地方不确定。不要补写图片中不存在的题目、公式或文字。
- 如果 request_parts 已清楚说明学习主题，以文字为主；无关背景不能改变主题。
- 如果 request_parts 使用“这个、这里、这道题、我手上的内容”等指代，使用 image_observation 确定主题。
- 图片无法看清且文字又不能独立确定主题时，返回 clarify 和简短追问，course 必须为 null。
- 图片部分可读时，把不确定内容保留在 uncertainties 中，不要把猜测当成确定事实。

${ADMISSION_OUTLINE_SYSTEM_PROMPT}`;

const CAMERA_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `用户提交了一段文字或语音，同时附带了一张此刻的摄像头画面。只在这一次请求中读取图片。
- image_observation 必须忠实记录图片是否看清、实际看到了什么、哪些地方不确定。不要补写图片中不存在的题目、公式或文字。
- 如果 request_parts 已清楚说明学习主题，以文字为主；无关背景不能改变主题。
- 如果 request_parts 使用“这个、这里、这道题、我手上的内容”等指代，使用 image_observation 确定主题。
- 图片无法看清且文字又不能独立确定主题时，返回 clarify 和简短追问，course 必须为 null。
- 图片部分可读时，把不确定内容保留在 uncertainties 中，不要把猜测当成确定事实。

${ADMISSION_BOOTSTRAP_SYSTEM_PROMPT}`;

function cameraObservation(value: unknown): CameraLessonObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation", "expected an object");
  }
  const candidate = value as Record<string, unknown>;
  const readability = candidate.readability;
  const observedContent = typeof candidate.observed_content === "string"
    ? candidate.observed_content.trim()
    : "";
  const uncertainties = Array.isArray(candidate.uncertainties)
    ? candidate.uncertainties.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : undefined;
  if (readability !== "readable" && readability !== "partially_readable" && readability !== "unreadable") {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.readability", "expected readable, partially_readable, or unreadable");
  }
  if (uncertainties === undefined || uncertainties.length > 12) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.uncertainties", "expected at most 12 strings");
  }
  if (observedContent.length > 4_000 || uncertainties.some((item) => item.length > 480)) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation", "camera observation exceeds its bounded text size");
  }
  if (readability !== "unreadable" && !observedContent) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.observed_content", "readable camera input requires observed content");
  }
  return { readability, observed_content: observedContent, uncertainties };
}

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

function normalizeModelNumberRange(number: Record<string, unknown>): void {
  if (typeof number.initial !== "number" || !Number.isFinite(number.initial)
    || typeof number.min !== "number" || !Number.isFinite(number.min)
    || typeof number.max !== "number" || !Number.isFinite(number.max)) return;
  const initial = number.initial;
  let min = Math.min(number.min, number.max, initial);
  let max = Math.max(number.min, number.max, initial);
  if (min === max) {
    // A zero-width teaching range cannot drive an animation or slider. The
    // value itself is still useful course intent, so give it a small stable
    // neighbourhood rather than asking the model to restate the same number.
    const padding = Math.max(1, Math.abs(initial) * 0.1);
    min = initial - padding;
    max = initial + padding;
  }
  number.min = min;
  number.max = max;
  number.initial = initial;
}

function defaultCoverageSection(
  requestPart: number,
  requestPartCount: number,
  sectionCount: number,
): number {
  // Request parts and outline sections are both ordered. When the model omits
  // only trailing coverage metadata, keep its accepted outline unchanged and
  // assign each missing tail requirement to the corresponding later section.
  // The original request text is then passed into that section's exact prompt.
  return Math.min(
    sectionCount,
    Math.max(1, Math.ceil((requestPart * sectionCount) / requestPartCount)),
  );
}

function lowerModelOutline(value: unknown, requestPartCount = 0): unknown {
  const root = pruneModelNulls(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root as Record<string, unknown>;
  candidate.version = LESSON_PLAN_VERSION;
  if (Array.isArray(candidate.numbers)) {
    candidate.numbers = candidate.numbers.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const number = { ...(entry as Record<string, unknown>) };
      delete number.student_control;
      if (typeof number.unit === "string" && !number.unit.trim()) delete number.unit;
      if (typeof number.label === "string" && !number.label.trim()) delete number.label;
      normalizeModelNumberRange(number);
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
    candidate.request_coverage = candidate.request_coverage.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const coverage = { ...(entry as Record<string, unknown>) };
      coverage.request_part = index + 1;
      if (coverage.treatment === "teach") delete coverage.reason;
      return coverage;
    });
  }
  if (requestPartCount > 0
    && (candidate.request_coverage === undefined || Array.isArray(candidate.request_coverage))
    && Array.isArray(candidate.sections)
    && candidate.sections.length > 0) {
    const coverage = (candidate.request_coverage ?? []) as unknown[];
    for (let index = coverage.length; index < requestPartCount; index += 1) {
      const requestPart = index + 1;
      coverage.push({
        request_part: requestPart,
        treatment: "teach",
        sections: [defaultCoverageSection(requestPart, requestPartCount, candidate.sections.length)],
      });
    }
    candidate.request_coverage = coverage;
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
      if (Array.isArray(visual.use_sections)) {
        const sections = visual.use_sections.filter((section) => Number.isInteger(section) && Number(section) > 0)
          .map(Number);
        if (sections.length > 0) visual.create_section = Math.min(...sections);
      }
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

function withProgramCreateDefaults(
  value: Record<string, unknown>,
  kind: "visual" | "math" | "note",
  relation?: "primary" | "supporting" | "comparison",
): Record<string, unknown> {
  const lowered = { ...value };
  if (lowered.role === undefined) {
    lowered.role = kind === "visual"
      ? relation === "comparison" ? "comparison_visual"
        : relation === "supporting" ? "supporting_visual"
          : "main_visual"
      : kind === "math" ? "derivation" : "explanation";
  }
  if (lowered.placement === undefined) {
    lowered.placement = {
      relation: kind === "visual"
        ? relation === "supporting" || relation === "comparison" ? "right_of" : "new_region"
        : "below",
    };
  }
  return lowered;
}

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

const atomicBareFunctionPattern = new RegExp(
  `\\b(${[...formulaFunctions].join("|")})\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu",
);

const atomicSubscriptLogPattern = new RegExp(
  `\\blog_\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu",
);

const parenthesizedSubscriptLogPattern = new RegExp(
  `\\blog_?\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s*\\(\\s*(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))\\s*\\)`,
  "giu",
);

function normalizeAtomicBareFunctionCalls(formula: string): string {
  // Only normalize an unambiguous, single atomic argument. Expressions such
  // as `log x^2` or `sin x y` keep failing instead of being guessed.
  return formula
    .replace(parenthesizedSubscriptLogPattern, (_match, base: string, argument: string) => {
      const numericBase = Number(base);
      if (!(numericBase > 0) || numericBase === 1) return _match;
      return `(log(${argument})/log(${base}))`;
    })
    .replace(atomicSubscriptLogPattern, (_match, base: string, argument: string) => {
      const numericBase = Number(base);
      if (!(numericBase > 0) || numericBase === 1) return _match;
      // Change of base works regardless of whether the runtime's `log` is
      // natural or base ten, and avoids adding a second log operator.
      return `(log(${argument})/log(${base}))`;
    })
    .replace(atomicBareFunctionPattern, (_match, name: string, argument: string) => (
      `${name}(${argument})`
    ));
}

function formulaLexemes(rawFormula: unknown, path: string): FormulaLexeme[] {
  if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 256) {
    return formulaError(path, "expected a non-empty formula up to 256 characters");
  }
  let formula = normalizeAtomicBareFunctionCalls(rawFormula.trim())
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
  if (capability === "implicit_surface_with_section"
    && typeof parameters.expression === "string") {
    const equation = parameters.expression.split("=").map((part) => part.trim());
    if (equation.length === 2 && equation.every(Boolean)) {
      const rightLevel = Number(equation[1]);
      const leftLevel = Number(equation[0]);
      if (Number.isFinite(rightLevel)) {
        parameters.expression = equation[0];
        parameters.level = rightLevel;
      } else if (Number.isFinite(leftLevel)) {
        parameters.expression = equation[1];
        parameters.level = leftLevel;
      } else {
        parameters.expression = `(${equation[0]})-(${equation[1]})`;
        parameters.level = 0;
      }
    } else if (parameters.level === undefined) {
      // Implicit equations are canonically F(x,y,z)=0. When the model writes
      // only the residual expression, the missing right-hand side is execution
      // state the program can supply without regenerating the section.
      parameters.level = 0;
    }
  }
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

type VisualNumberPurpose = "angle" | "radius" | "section" | "progress" | "generic";

function visualNumberPurpose(capability: keyof typeof LESSON_PLAN_CAPABILITY_REGISTRY, index: number): VisualNumberPurpose {
  const input = LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs[index] as string | undefined;
  if (!input || input.startsWith("curve_parameter_")) return "generic";
  if (input === "angle" || input === "phase") return "angle";
  if (input === "radius") return "radius";
  if (input === "section_height" || input === "section_position") return "section";
  if (input === "progress") return "progress";
  return "generic";
}

function compatibleVisualNumberPurpose(left: VisualNumberPurpose, right: VisualNumberPurpose): boolean {
  return left === "generic" || right === "generic" || left === right;
}

function processDiagramRemovalReason(content: LessonPlanVisualContent): string | undefined {
  if (content.capability !== "process_diagram") return undefined;
  const input = content.parameters ?? {};
  const steps = input.steps;
  const title = input.title;
  if (!Array.isArray(steps)) return "missing_steps";
  if (steps.length < PROCESS_DIAGRAM_CONTRACT.min_steps || steps.length > PROCESS_DIAGRAM_CONTRACT.max_steps) {
    return "step_count_out_of_range";
  }
  if (!steps.every((step) => (
    typeof step === "string"
    && step.trim().length >= 1
    && step.trim().length <= PROCESS_DIAGRAM_CONTRACT.max_step_characters
  ))) {
    return "step_text_out_of_range";
  }
  if (title !== undefined && (
    typeof title !== "string"
    || title.trim().length < 1
    || title.trim().length > PROCESS_DIAGRAM_CONTRACT.max_title_characters
  )) {
    return "title_text_out_of_range";
  }
  return undefined;
}

function isExecutableProcessDiagram(content: LessonPlanVisualContent): boolean {
  return processDiagramRemovalReason(content) === undefined;
}

function rebuildCreatePlacements(
  outline: LessonPlanOutline,
  drafts: LessonPlanSectionDraft[],
): void {
  const latestReusableBefore = (sectionNumber: number): LessonPlanReference | undefined => {
    for (let section = sectionNumber - 1; section >= 1; section -= 1) {
      const items = outline.sections[section - 1]?.reusable_items ?? [];
      for (let item = items.length; item >= 1; item -= 1) {
        if (items[item - 1]?.kind === "board_item") {
          return { source: "reusable", section, item };
        }
      }
    }
    return undefined;
  };

  drafts.forEach((section, sectionOffset) => {
    let latestBoardReference = latestReusableBefore(sectionOffset + 1);
    section.moments.forEach((moment, momentOffset) => {
      let boardItem = 0;
      for (const action of moment.actions) {
        if (action.action !== "create") continue;
        const requestedRelation = action.placement?.relation ?? "new_region";
        action.placement = requestedRelation !== "new_region" && latestBoardReference
          ? {
              relation: requestedRelation,
              reference: structuredClone(latestBoardReference),
            }
          : { relation: "new_region" };
        boardItem += 1;
        latestBoardReference = {
          source: "local_board_item",
          moment: momentOffset + 1,
          item: boardItem,
        };
      }
    });
  });
}

function sanitizeNonessentialVisuals(
  outlineValue: LessonPlanOutline,
  draftValues: LessonPlanSectionDraft[],
): {
  outline: LessonPlanOutline;
  drafts: LessonPlanSectionDraft[];
  adjustments: Array<{
    kind: "visual_removed" | "duplicate_board_item_removed";
    section: number;
    capability?: keyof typeof LESSON_PLAN_CAPABILITIES;
    moment?: number;
    board_kind?: "math" | "note";
    reason: string;
  }>;
} {
  const outline = structuredClone(outlineValue);
  const drafts = structuredClone(draftValues);
  const adjustments: Array<{
    kind: "visual_removed" | "duplicate_board_item_removed";
    section: number;
    capability?: keyof typeof LESSON_PLAN_CAPABILITIES;
    moment?: number;
    board_kind?: "math" | "note";
    reason: string;
  }> = [];
  const courseVisualPositionBySlot = new Map<string, number>();
  (outline.course_visuals ?? []).forEach((visual, index) => {
    courseVisualPositionBySlot.set(`${visual.create_section}:${visual.reusable_item}`, index + 1);
  });
  const droppedCourseVisuals = new Set<number>();
  const establishedPurposes = new Map<number, VisualNumberPurpose>();
  const visualEntries: Array<{
    content: LessonPlanVisualContent;
    courseVisualPosition?: number;
    relation?: "primary" | "supporting" | "comparison";
  }> = [];

  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const slot = Number(action.reusable_item);
        const courseVisualPosition = Number.isInteger(slot)
          ? courseVisualPositionBySlot.get(`${sectionNumber}:${slot}`)
          : undefined;
        const processDiagramReason = processDiagramRemovalReason(content);
        if (processDiagramReason) {
          adjustments.push({
            kind: "visual_removed",
            section: sectionNumber,
            capability: content.capability,
            reason: processDiagramReason,
          });
          if (courseVisualPosition !== undefined) droppedCourseVisuals.add(courseVisualPosition);
          continue;
        }
        visualEntries.push({
          content,
          courseVisualPosition,
          relation: courseVisualPosition === undefined
            ? undefined
            : outline.course_visuals?.[courseVisualPosition - 1]?.relation,
        });
      }
    }
  }

  // The primary teaching picture owns a numeric meaning even if the model
  // happens to emit a supporting create action first. Execution must not
  // depend on probabilistic action ordering.
  visualEntries.sort((left, right) => {
    const priority = (relation: typeof left.relation): number => (
      relation === "supporting" ? 1 : 0
    );
    return priority(left.relation) - priority(right.relation)
      || (left.courseVisualPosition ?? Number.MAX_SAFE_INTEGER)
        - (right.courseVisualPosition ?? Number.MAX_SAFE_INTEGER);
  });
  for (const entry of visualEntries) {
    const incompatible = (entry.content.numbers ?? []).some((number, index) => {
      const next = visualNumberPurpose(entry.content.capability, index);
      const current = establishedPurposes.get(number);
      if (!current || compatibleVisualNumberPurpose(current, next)) {
        if (!current || current === "generic") establishedPurposes.set(number, next);
        return false;
      }
      return true;
    });
    if (!incompatible) continue;
    if (entry.relation === "supporting" && entry.courseVisualPosition !== undefined) {
      droppedCourseVisuals.add(entry.courseVisualPosition);
    } else {
      // A primary visual remains useful without an accidental shared
      // control. Make it static instead of rejecting the whole section.
      delete entry.content.numbers;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    (outline.course_visuals ?? []).forEach((visual, index) => {
      const position = index + 1;
      if (droppedCourseVisuals.has(position)) return;
      if (visual.related_visual !== undefined && droppedCourseVisuals.has(visual.related_visual)) {
        droppedCourseVisuals.add(position);
        changed = true;
      }
    });
  }

  const droppedActions = new Set<LessonPlanAction>();
  const replacementForDroppedAction = new Map<LessonPlanAction, LessonPlanAction>();
  const droppedReusable = new Set<string>();
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const slot = Number(action.reusable_item);
        const position = Number.isInteger(slot)
          ? courseVisualPositionBySlot.get(`${sectionNumber}:${slot}`)
          : undefined;
        if (!isExecutableProcessDiagram(content)
          || (position !== undefined && droppedCourseVisuals.has(position))) {
          droppedActions.add(action);
          if (Number.isInteger(slot)) droppedReusable.add(`${sectionNumber}:${slot}`);
        }
      }
    }
  }

  // Two identical formula/note cards created in the same teaching moment do
  // not carry two meanings. Keep the reusable copy when one exists; otherwise
  // keep the first. This is presentation cleanup, not a model-authored choice.
  for (const [sectionOffset, section] of drafts.entries()) {
    section.moments.forEach((moment, momentOffset) => {
      const bySignature = new Map<string, LessonPlanAction>();
      for (const action of moment.actions) {
        if (action.action !== "create" || (action.kind !== "math" && action.kind !== "note")) continue;
        const signature = JSON.stringify({ kind: action.kind, content: action.content });
        const prior = bySignature.get(signature);
        if (!prior) {
          bySignature.set(signature, action);
          continue;
        }
        const priorReusable = Number.isInteger(prior.reusable_item);
        const currentReusable = Number.isInteger(action.reusable_item);
        const removed = currentReusable && !priorReusable ? prior : action;
        const retained = removed === prior ? action : prior;
        if (removed === prior) bySignature.set(signature, action);
        droppedActions.add(removed);
        replacementForDroppedAction.set(removed, retained);
        adjustments.push({
          kind: "duplicate_board_item_removed",
          section: sectionOffset + 1,
          moment: momentOffset + 1,
          board_kind: action.kind,
          reason: "same_moment_exact_duplicate",
        });
      }
    });
  }

  const localBoardItemMap = new Map<string, number | undefined>();
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    section.moments.forEach((moment, momentOffset) => {
      const creates = moment.actions.filter((action) => action.action === "create");
      const retainedIndex = new Map<LessonPlanAction, number>();
      let nextIndex = 0;
      for (const action of creates) {
        if (droppedActions.has(action)) continue;
        nextIndex += 1;
        retainedIndex.set(action, nextIndex);
      }
      creates.forEach((action, oldOffset) => {
        const replacement = replacementForDroppedAction.get(action);
        localBoardItemMap.set(
          `${sectionNumber}:${momentOffset + 1}:${oldOffset + 1}`,
          droppedActions.has(action)
            ? replacement ? retainedIndex.get(replacement) : undefined
            : retainedIndex.get(action),
        );
      });
    });
  }

  const retainedReusable = new Set<string>();
  for (const [sectionOffset, section] of drafts.entries()) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (droppedActions.has(action) || action.action !== "create") continue;
        if (Number.isInteger(action.reusable_item)) retainedReusable.add(`${sectionOffset + 1}:${action.reusable_item}`);
      }
    }
  }

  const reassignedReusable = new Set<string>();
  for (const key of droppedReusable) {
    const [sectionNumberText, slotText] = key.split(":");
    const sectionNumber = Number(sectionNumberText);
    const slot = Number(slotText);
    if ([...retainedReusable].some((candidate) => candidate.startsWith(`${sectionNumber}:`))) continue;
    const section = drafts[sectionNumber - 1];
    const replacement = [...(section?.moments ?? [])]
      .flatMap((moment) => moment.actions)
      .findLast((action) => action.action === "create"
        && !droppedActions.has(action)
        && action.reusable_item === undefined
        && action.kind !== "visual");
    if (!replacement || replacement.action !== "create") continue;
    replacement.reusable_item = slot;
    const declaration = outline.sections[sectionNumber - 1]?.reusable_items?.[slot - 1];
    if (declaration) {
      outline.sections[sectionNumber - 1]!.reusable_items![slot - 1] = {
        kind: "board_item",
        board_kind: replacement.kind,
      };
      retainedReusable.add(key);
      reassignedReusable.add(key);
    }
  }

  const removedReusable = new Set(
    [...droppedReusable].filter((key) => !reassignedReusable.has(key)),
  );
  const reusableItemMap = new Map<string, number>();
  outline.sections.forEach((section, sectionOffset) => {
    const sectionNumber = sectionOffset + 1;
    const retainedItems = (section.reusable_items ?? []).flatMap((item, itemOffset) => {
      const oldItem = itemOffset + 1;
      if (removedReusable.has(`${sectionNumber}:${oldItem}`)) return [];
      return [{ item, oldItem }];
    });
    retainedItems.forEach(({ oldItem }, index) => {
      reusableItemMap.set(`${sectionNumber}:${oldItem}`, index + 1);
    });
    section.reusable_items = retainedItems.map(({ item }) => item);
  });
  drafts.forEach((section, sectionOffset) => {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || !Number.isInteger(action.reusable_item)) continue;
        const nextItem = reusableItemMap.get(`${sectionNumber}:${action.reusable_item}`);
        if (nextItem !== undefined) action.reusable_item = nextItem;
      }
    }
  });

  const normalizeReference = (
    reference: LessonPlanReference | undefined,
    sectionNumber: number,
  ): LessonPlanReference | undefined => {
    if (!reference) return undefined;
    const next = structuredClone(reference);
    if (next.source === "local_board_item") {
      const item = localBoardItemMap.get(`${sectionNumber}:${next.moment}:${next.item}`);
      if (item === undefined) return undefined;
      next.item = item;
    } else if (next.source === "reusable") {
      const key = `${next.section}:${next.item}`;
      if (removedReusable.has(key)) return undefined;
      const nextItem = reusableItemMap.get(key);
      if (nextItem === undefined) return undefined;
      next.item = nextItem;
      if (reassignedReusable.has(key)) delete next.part;
    }
    return next;
  };

  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      const actions: LessonPlanAction[] = [];
      for (const action of moment.actions) {
        if (droppedActions.has(action)) continue;
        const next = structuredClone(action) as LessonPlanAction;
        if (next.action === "create") {
          const reference = normalizeReference(next.placement?.reference, sectionNumber);
          if (next.placement && next.placement.reference && !reference) {
            next.placement = { relation: "new_region" };
          } else if (next.placement && reference) {
            next.placement.reference = reference;
          }
        } else if (next.action === "revise" || next.action === "emphasize" || next.action === "point_at") {
          const reference = normalizeReference(next.reference, sectionNumber);
          if (!reference) continue;
          next.reference = reference;
        } else if (next.action === "connect") {
          const from = normalizeReference(next.from_ref, sectionNumber);
          const to = normalizeReference(next.to_ref, sectionNumber);
          if (!from || !to) continue;
          next.from_ref = from;
          next.to_ref = to;
        } else if (next.action === "group") {
          next.members = next.members.flatMap((reference) => {
            const normalized = normalizeReference(reference, sectionNumber);
            return normalized ? [normalized] : [];
          });
          if (next.members.length === 0) continue;
        } else if (next.action === "focus") {
          next.references = next.references.flatMap((reference) => {
            const normalized = normalizeReference(reference, sectionNumber);
            return normalized ? [normalized] : [];
          });
          if (next.references.length === 0) continue;
        }
        actions.push(next);
      }
      moment.actions = actions.length > 0 ? actions : [{
        action: "teacher_expression",
        expression: "neutral",
        timing: "after_speech",
      }];
    }
    if (section.student_activities) {
      section.student_activities = section.student_activities.flatMap((activity) => {
        if (activity.kind !== "scene3d_view") return [activity];
        const reference = normalizeReference(activity.reference, sectionNumber);
        return reference ? [{ ...activity, reference }] : [];
      });
      if (section.student_activities.length === 0) delete section.student_activities;
    }
  }

  // Dropping or deduplicating a create action changes local board-item
  // positions. Rebuild every placement from the final retained action order,
  // so no card can point to a removed item or to itself.
  rebuildCreatePlacements(outline, drafts);

  if (outline.course_visuals) {
    const retainedPositions = outline.course_visuals
      .map((visual, index) => ({ visual, oldPosition: index + 1 }))
      .filter(({ oldPosition }) => !droppedCourseVisuals.has(oldPosition));
    const positionMap = new Map(retainedPositions.map(({ oldPosition }, index) => [oldPosition, index + 1]));
    outline.course_visuals = retainedPositions.map(({ visual }) => ({
      ...visual,
      reusable_item: reusableItemMap.get(`${visual.create_section}:${visual.reusable_item}`)
        ?? visual.reusable_item,
      ...(visual.related_visual === undefined
        ? {}
        : { related_visual: positionMap.get(visual.related_visual) }),
    }));
  }
  outline.close.focus = outline.close.focus.flatMap((reference) => {
    const normalized = normalizeReference(reference, outline.sections.length + 1);
    return normalized ? [normalized] : [];
  });
  if (outline.close.focus.length === 0) {
    const fallback = [...retainedReusable]
      .flatMap((key) => {
        const [section, item] = key.split(":").map(Number);
        const nextItem = reusableItemMap.get(key);
        return nextItem === undefined ? [] : [`${section}:${nextItem}`];
      })
      .at(-1);
    if (fallback) {
      const [section, item] = fallback.split(":").map(Number);
      outline.close.focus = [{ source: "reusable", section, item }];
    }
  }
  return { outline, drafts, adjustments };
}

/**
 * Remove non-executable visuals and interactions without asking the model to
 * rewrite an otherwise usable section.
 */
function normalizeExecutableNumberInteractions(
  outlineValue: LessonPlanOutline,
  draftValues: LessonPlanSectionDraft[],
): ReturnType<typeof sanitizeNonessentialVisuals> {
  const sanitized = sanitizeNonessentialVisuals(outlineValue, draftValues);
  const outline = sanitized.outline;
  const drafts = sanitized.drafts;
  // A model can describe an animation endpoint that lies just outside the
  // teaching range it declared in the outline. Both values are explicit
  // course intent; asking the model to choose between them again adds latency
  // without adding information. Build the executable range from their union,
  // then let installed capability policies apply any physical/rendering limit
  // during compilation.
  for (const section of drafts) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "animate") continue;
        const definition = outline.numbers?.[action.number - 1];
        if (!definition || !Number.isFinite(action.end_value)) continue;
        const nextMin = Math.min(definition.min, action.end_value);
        const nextMax = Math.max(definition.max, action.end_value);
        if (nextMin === definition.min && nextMax === definition.max) continue;
        definition.min = nextMin;
        definition.max = nextMax;
        definition.initial = Math.min(nextMax, Math.max(nextMin, definition.initial));
        if (definition.student_control) {
          definition.student_control.step = deriveSliderStep(nextMin, nextMax);
        }
      }
    }
  }
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
  return { outline, drafts, adjustments: sanitized.adjustments };
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

/**
 * The combined provider schema cannot know the outline that is being written
 * in the same response. Convert its broad create arrays into the exact
 * outline-owned positions before the ordinary strict section lowering runs.
 * Unmatched visuals are discarded; missing outline visuals stay missing so
 * the accepted outline, rather than the speculative section, remains the
 * authority and triggers a section-only repair.
 */
function reconcileBootstrapFirstSectionPositions(
  value: unknown,
  outline: LessonPlanOutline,
): unknown {
  const root = structuredClone(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root as Record<string, unknown>;
  if (!Array.isArray(candidate.moments)) return root;

  // Tests and older compatible callers may already provide the exact
  // outline-indexed root objects. Keep those objects for the same strict
  // validator below, while still removing any broad-schema visual extras.
  if (candidate.course_visual_creates !== undefined || candidate.reusable_board_creates !== undefined) {
    for (const momentValue of candidate.moments) {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
      delete (momentValue as Record<string, unknown>).visual_creates;
    }
    return root;
  }

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
  const unmatchedVisuals = new Set(visualCreates);
  const matchedVisuals = new Map<CreateCandidate, number>();
  const expectedVisuals = (outline.course_visuals ?? [])
    .map((visual, index) => ({ visual, position: index + 1 }))
    .filter(({ visual }) => visual.create_section === 1);
  for (const { visual, position } of expectedVisuals) {
    const matchesCapability = (candidateEntry: CreateCandidate): boolean => {
      if (!unmatchedVisuals.has(candidateEntry)) return false;
      const content = candidateEntry.entry.content;
      return content && typeof content === "object" && !Array.isArray(content)
        && (content as Record<string, unknown>).capability === visual.capability;
    };
    const match = visualCreates.find((candidateEntry) => (
      candidateEntry.entry.course_visual === position && unmatchedVisuals.has(candidateEntry)
    )) ?? visualCreates.find(matchesCapability);
    if (!match) continue;
    matchedVisuals.set(match, position);
    unmatchedVisuals.delete(match);
  }
  const fixedCourseCreates = Object.fromEntries([...matchedVisuals].map(([match, position]) => {
    const entry = structuredClone(match.entry);
    delete entry.order;
    delete entry.course_visual;
    delete entry.reusable_item;
    const content = entry.content && typeof entry.content === "object" && !Array.isArray(entry.content)
      ? { ...(entry.content as Record<string, unknown>) }
      : {};
    delete content.capability;
    entry.content = content;
    return [`visual_${position}`, { moment: match.moment, ...entry }];
  }));
  for (const momentValue of candidate.moments) {
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
    delete (momentValue as Record<string, unknown>).visual_creates;
  }
  if (expectedVisuals.length > 0) candidate.course_visual_creates = fixedCourseCreates;
  else delete candidate.course_visual_creates;

  const createsByKind = {
    math: collect("math_creates"),
    note: collect("note_creates"),
  };
  const usedBoardCreates = new Set<CreateCandidate>();
  const reusableItems = outline.sections[0]?.reusable_items ?? [];
  const fixedReusableCreates: Record<string, unknown> = {};
  reusableItems.forEach((item, index) => {
    if (item.kind !== "board_item" || (item.board_kind !== "math" && item.board_kind !== "note")) return;
    const reusablePosition = index + 1;
    const match = createsByKind[item.board_kind].find((candidateEntry) => (
      !usedBoardCreates.has(candidateEntry)
        && candidateEntry.entry.reusable_item === reusablePosition
    )) ?? createsByKind[item.board_kind].find((candidateEntry) => !usedBoardCreates.has(candidateEntry));
    if (!match) return;
    usedBoardCreates.add(match);
    const entry = structuredClone(match.entry);
    delete entry.order;
    delete entry.reusable_item;
    fixedReusableCreates[`item_${index + 1}`] = { moment: match.moment, ...entry };
  });
  for (const [collection, entries] of Object.entries(createsByKind) as Array<
    ["math" | "note", CreateCandidate[]]
  >) {
    const selected = new Set(entries.filter((entry) => usedBoardCreates.has(entry)).map(({ entry }) => entry));
    const property = collection === "math" ? "math_creates" : "note_creates";
    for (const momentValue of candidate.moments) {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
      const moment = momentValue as Record<string, unknown>;
      if (!Array.isArray(moment[property])) continue;
      moment[property] = moment[property].filter((entry) => !selected.has(entry as Record<string, unknown>));
    }
  }
  const expectsReusableBoardCreates = reusableItems.some((item) => (
    item.kind === "board_item" && (item.board_kind === "math" || item.board_kind === "note")
  ));
  if (expectsReusableBoardCreates) candidate.reusable_board_creates = fixedReusableCreates;
  else delete candidate.reusable_board_creates;

  return root;
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
  if (candidate.section !== undefined && candidate.section !== expectedSection) {
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
      let entry = { ...(source as Record<string, unknown>) };
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
      entry = withProgramCreateDefaults(entry, "visual", visual.relation);
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
      let entry = { ...(source as Record<string, unknown>) };
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
      entry = withProgramCreateDefaults(entry, item.board_kind === "math" ? "math" : "note");
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
        let action = {
          ...("kind" in descriptor ? { kind: descriptor.kind } : {}),
          ...(entry as Record<string, unknown>),
        };
        if (descriptor.action === "create" && "kind" in descriptor) {
          action = withProgramCreateDefaults(action, descriptor.kind);
        }
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
    const currentReferenceTimings = new Map<string, number>();
    const actionTimingRank = (value: unknown): number => (
      typeof value === "string" && value in timingOrder
        ? timingOrder[value as keyof typeof timingOrder]
        : 0
    );
    const referenceTimingRank = (value: unknown): number => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
      const reference = value as Record<string, unknown>;
      if (reference.moment !== momentIndex + 1
        || !["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) {
        return 0;
      }
      return currentReferenceTimings.get(`${reference.source}:${reference.item}`) ?? 0;
    };
    const ensureActionAfterReferences = (
      action: Record<string, unknown>,
      references: unknown[],
    ): void => {
      const requiredRank = Math.max(0, ...references.map(referenceTimingRank));
      if (actionTimingRank(action.timing) < requiredRank) {
        action.timing = timingName[requiredRank];
      }
    };
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
        currentReferenceTimings.set(
          `local_board_item:${currentCounts.local_board_item}`,
          actionTimingRank(action.timing),
        );
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
        ensureActionAfterReferences(action, [reference]);
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
        ensureActionAfterReferences(action, unique);
      }
      normalizedActions.push(action);
      if (action.action === "connect") {
        currentCounts.local_connection += 1;
        currentReferenceTimings.set(
          `local_connection:${currentCounts.local_connection}`,
          actionTimingRank(action.timing),
        );
      }
      if (action.action === "group") {
        currentCounts.local_group += 1;
        currentReferenceTimings.set(
          `local_group:${currentCounts.local_group}`,
          actionTimingRank(action.timing),
        );
      }
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
    version: outline.version,
    section: expectedSection,
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

function compactModelContext(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) => key !== "learner_request"
      && key !== "input_modality"
      && value !== null
      && value !== undefined),
  );
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

function sectionPromptContext(outline: LessonPlanOutline, sectionNumber: number): Record<string, unknown> {
  const section = outline.sections[sectionNumber - 1];
  return {
    title: outline.title,
    goals: outline.goals,
    ...(outline.numbers?.length ? {
      numbers: outline.numbers.map((number, index) => ({
        number: index + 1,
        label: number.label,
        initial: number.initial,
        min: number.min,
        max: number.max,
        ...(number.unit === undefined ? {} : { unit: number.unit }),
      })),
    } : {}),
    section: {
      section: sectionNumber,
      purpose: section?.purpose,
      reusable_items: (section?.reusable_items ?? []).map((item, index) => ({
        item: index + 1,
        ...item,
      })),
    },
    previous_sections: outline.sections.slice(0, sectionNumber - 1).map((previous, index) => ({
      section: index + 1,
      purpose: previous.purpose,
      reusable_items: (previous.reusable_items ?? []).map((item, itemIndex) => ({
        item: itemIndex + 1,
        ...item,
      })),
    })),
  };
}

function unsupportedSectionResponse(error: unknown, previousError?: unknown): string | undefined {
  if (!(error instanceof LessonPlanError)) return undefined;
  if (error.code === "LESSON_PLAN_UNSUPPORTED_REQUIREMENT") {
    return "目前还不能完整生成这节课，因为其中包含尚未支持的画面或互动。";
  }
  if (error.code === "LESSON_PLAN_EXPRESSION"
    && /multi-curve comparison currently supports static formulas only/u.test(error.message)
    && previousError instanceof LessonPlanError
    && previousError.code === error.code
    && previousError.message === error.message) {
    return "目前还不能在同一张函数图中同时展示静态曲线和由控件改变的另一条曲线。";
  }
  return undefined;
}

function sectionIndexFromError(error: unknown, sectionCount: number): number | undefined {
  if (!(error instanceof LessonPlanError)) return undefined;
  const draftMatch = error.path.match(/\$lessonPlanSectionDrafts\[(\d+)\]/u);
  const planMatch = error.path.match(/\$lessonPlan\.sections\[(\d+)\]/u);
  const offset = Number(draftMatch?.[1] ?? planMatch?.[1]);
  return Number.isInteger(offset) && offset >= 0 && offset < sectionCount ? offset + 1 : undefined;
}

function compilePrefix(
  outline: LessonPlanOutline,
  drafts: LessonPlanSectionDraft[],
  options: CompileLessonPlanOptions | undefined,
): CompiledLessonPlan {
  const sectionCount = drafts.length;
  let focus: { source: "reusable"; section: number; item: number } | undefined;
  for (let section = sectionCount; section >= 1 && !focus; section -= 1) {
    const createdItems = drafts[section - 1]?.moments.flatMap((moment) => moment.actions)
      .flatMap((action) => action.action === "create" && Number.isInteger(action.reusable_item)
        ? [Number(action.reusable_item)] : []) ?? [];
    const item = createdItems.length > 0 ? Math.max(...createdItems) : undefined;
    if (item !== undefined) focus = { source: "reusable", section, item };
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

function canFallBackFromBootstrap(error: unknown): boolean {
  if (error instanceof LessonPlanError) return true;
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return /(?:RESPONSE_TRUNCATED|RESPONSE_EMPTY)$/u.test(code);
}

function partialModelResponse(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("partialResponse" in error)) return undefined;
  const value = (error as { partialResponse?: unknown }).partialResponse;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function generateLessonPlanWithModel(
  model: LessonPlanModelCall,
  input: LessonPlanGenerationInput,
  options: GenerateLessonPlanOptions = {},
): Promise<LessonPlanGenerationResult> {
  const maxAttempts = positiveInteger(options.max_attempts_per_part, 3, "max_attempts_per_part");
  let context = inputContext(input);
  const fixedRequestParts = requestParts(input);
  const admissionInput = input.input_modality === "voice" || input.input_modality === "text";
  let modelCalls = 0;
  let outline: LessonPlanOutline | undefined;
  let bootstrappedFirstSection: LessonPlanSectionDraft | undefined;
  let outlineError: unknown;
  let stableCameraObservation: CameraLessonObservation | undefined;
  const sectionErrors = new Map<number, unknown>();
  const sectionAttempts = new Map<number, number>();

  const admissionCourse = (
    parsed: unknown,
    observeCamera: boolean,
  ): { course?: unknown; result?: NonLessonPlanResponse } => {
    if (!admissionInput) return { course: parsed };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanEnvelope",
        "lesson response envelope must be an object",
      );
    }
    const envelope = parsed as Record<string, unknown>;
    if (observeCamera) {
      stableCameraObservation = cameraObservation(envelope.image_observation);
      context = { ...context, camera_observation: stableCameraObservation };
    }
    const disposition = envelope.disposition;
    if (disposition !== "generate_lesson" && disposition !== "clarify" && disposition !== "ignore") {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanAdmission.disposition",
        "lesson admission must choose generate_lesson, clarify, or ignore",
      );
    }
    if (disposition !== "generate_lesson") {
      if (!Object.hasOwn(envelope, "course") || envelope.course !== null) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanAdmission.course",
          "clarify and ignore require course to be null",
        );
      }
      const learnerResponse = typeof envelope.learner_response === "string"
        ? envelope.learner_response.trim()
        : "";
      if (disposition === "clarify" && !learnerResponse) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanAdmission.learner_response",
          "clarify requires a learner-facing question",
        );
      }
      return {
        result: {
          disposition,
          learner_response: learnerResponse,
          model_calls: modelCalls,
        },
      };
    }
    if (!envelope.course || typeof envelope.course !== "object" || Array.isArray(envelope.course)) {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanAdmission.course",
        "generate_lesson requires a course object",
      );
    }
    return { course: envelope.course };
  };

  // The normal latency path asks for the complete outline and section 1 once.
  // It is speculative only in transport shape: the outline is validated first
  // and remains the sole authority for narrowing the section.
  try {
    const observeCamera = input.camera_input === true && stableCameraObservation === undefined;
    modelCalls += 1;
    const raw = await model({
      label: "lesson-plan-bootstrap",
      part: "bootstrap",
      attempt: 1,
      turn_id: input.turn_id,
      system_prompt: observeCamera
        ? CAMERA_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT
        : admissionInput
          ? ADMISSION_BOOTSTRAP_SYSTEM_PROMPT
          : BOOTSTRAP_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        course_context: compactModelContext(context),
        request_parts: fixedRequestParts,
        visual_recipe_columns: ["features", "numbers", "purpose"],
        visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability) => [
          [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].required_features],
          [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs],
          LESSON_PLAN_CAPABILITY_REGISTRY[capability].model_guidance,
        ]),
        first_section_to_write: 1,
        first_section_rule: "first_section must implement outline.sections[0]; outline is authoritative and the program assigns all execution references",
      }),
      response_schema: observeCamera
        ? buildCameraLessonPlanAdmissionBootstrapJsonSchema(fixedRequestParts.length)
        : admissionInput
          ? buildLessonPlanAdmissionBootstrapJsonSchema(fixedRequestParts.length)
          : buildLessonPlanBootstrapJsonSchema(fixedRequestParts.length),
      ...(observeCamera ? { include_camera_media: true } : {}),
    });
    const parsed = parseModelJson(raw, admissionInput ? "lessonPlanEnvelope" : "lessonPlanBootstrap");
    const admitted = admissionCourse(parsed, observeCamera);
    if (admitted.result) return admitted.result;
    const course = pruneModelNulls(admitted.course);
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_JSON", "$lessonPlanBootstrap.course", "expected outline and first_section");
    }
    const bootstrap = course as Record<string, unknown>;
    outline = validateLessonPlanOutline(
      lowerModelOutline(
        coerceLessonPlanOutlineModelNumbers(bootstrap.outline, fixedRequestParts.length),
        fixedRequestParts.length,
      ),
      fixedRequestParts.length,
    );
    try {
      bootstrappedFirstSection = lowerModelSectionDraft(
        reconcileBootstrapFirstSectionPositions(
          coerceLessonPlanBootstrapSectionModelNumbers(bootstrap.first_section),
          outline,
        ),
        outline,
        1,
        true,
      );
    } catch (error) {
      sectionErrors.set(1, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section: 1,
        attempt: 1,
        error: rejectionDetails(error),
      });
    }
  } catch (error) {
    const partialResponse = partialModelResponse(error);
    if (partialResponse) {
      if (input.camera_input === true && stableCameraObservation === undefined) {
        const partialObservation = completedJsonObjectProperty(partialResponse, "image_observation");
        if (partialObservation !== undefined) {
          try {
            stableCameraObservation = cameraObservation(partialObservation);
            context = { ...context, camera_observation: stableCameraObservation };
          } catch (observationError) {
            outlineError = observationError;
          }
        }
      }
      const partialOutline = completedJsonObjectProperty(partialResponse, "outline");
      if (partialOutline !== undefined) {
        try {
          outline = validateLessonPlanOutline(
            lowerModelOutline(
              coerceLessonPlanOutlineModelNumbers(partialOutline, fixedRequestParts.length),
              fixedRequestParts.length,
            ),
            fixedRequestParts.length,
          );
          sectionErrors.set(1, error);
        } catch (outlineValidationError) {
          outline = undefined;
          outlineError = outlineValidationError;
        }
      }
    }
    if (!outline && !canFallBackFromBootstrap(error) && !partialResponse) throw error;
    if (input.camera_input === true && stableCameraObservation === undefined) {
      return {
        disposition: "clarify",
        learner_response: "我没能稳定读取这次摄像头画面，请把题目或物体放到画面中央后再试一次。",
        model_calls: modelCalls,
      };
    }
    outlineError ??= error;
    await options.on_rejected_part?.({
      label: "lesson-plan-bootstrap",
      attempt: 1,
      error: rejectionDetails(error),
    });
  }

  // A malformed/truncated combined response falls back once to the proven
  // outline-only path. The large combined request itself is never repeated.
  for (let attempt = 1; !outline && attempt <= maxAttempts; attempt += 1) {
    const observeCamera = input.camera_input === true && stableCameraObservation === undefined;
    try {
      modelCalls += 1;
      const raw = await model({
        label: "lesson-plan-outline",
        part: "outline",
        attempt,
        turn_id: input.turn_id,
        system_prompt: observeCamera
          ? CAMERA_ADMISSION_OUTLINE_SYSTEM_PROMPT
          : admissionInput
            ? ADMISSION_OUTLINE_SYSTEM_PROMPT
            : OUTLINE_SYSTEM_PROMPT,
        prompt: JSON.stringify({
          course_context: compactModelContext(stableCameraObservation
            ? { ...context, camera_observation: stableCameraObservation }
            : context),
          request_parts: fixedRequestParts,
          visual_recipe_columns: ["features", "numbers", "purpose"],
          visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability) => [
            [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].required_features],
            [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs],
            LESSON_PLAN_CAPABILITY_REGISTRY[capability].model_guidance,
          ]),
          ...(outlineError ? { previous_validation_error: errorFeedback(outlineError) } : {}),
        }),
        response_schema: observeCamera
          ? buildCameraLessonPlanAdmissionOutlineJsonSchema(fixedRequestParts.length)
          : admissionInput
            ? buildLessonPlanAdmissionOutlineJsonSchema(fixedRequestParts.length)
            : buildLessonPlanOutlineJsonSchema(fixedRequestParts.length),
        ...(observeCamera ? { include_camera_media: true } : {}),
      });
      const parsed = parseModelJson(raw, admissionInput ? "lessonPlanEnvelope" : "lessonPlanOutline");
      const admitted = admissionCourse(parsed, observeCamera);
      if (admitted.result) return admitted.result;
      outline = validateLessonPlanOutline(
        lowerModelOutline(
          coerceLessonPlanOutlineModelNumbers(admitted.course, fixedRequestParts.length),
          fixedRequestParts.length,
        ),
        fixedRequestParts.length,
      );
    } catch (error) {
      if (!(error instanceof LessonPlanError)) throw error;
      outlineError = error;
      await options.on_rejected_part?.({
        label: "lesson-plan-outline",
        attempt,
        error: rejectionDetails(error),
      });
      if (observeCamera && stableCameraObservation === undefined) {
        return {
          disposition: "clarify",
          learner_response: "我没能稳定读取这次摄像头画面，请把题目或物体放到画面中央后再试一次。",
          model_calls: modelCalls,
        };
      }
    }
  }
  if (!outline) throw outlineError;
  await options.on_outline_ready?.({
    sections: outline.sections.length,
    course_visuals: outline.course_visuals?.length ?? 0,
    request_parts: fixedRequestParts.length,
    camera_observation: stableCameraObservation !== undefined,
  });
  const unsupported = outline.request_coverage?.find((item) => item.treatment === "unsupported");
  if (unsupported) {
    const reason = unsupported.reason?.trim();
    const learnerResponse = reason
      && reason.length <= 480
      && !/\$lesson|LESSON_PLAN_|already exhausted|do not call|internal attempts/iu.test(reason)
      ? `目前还不能完整生成这节课：${reason}`
      : "目前还不能完整生成这节课，因为其中包含尚未支持的画面或互动。";
    return {
      disposition: "unsupported",
      learner_response: learnerResponse,
      model_calls: modelCalls,
    };
  }

  const visualsForSection = (section: number) => (outline.course_visuals ?? []).flatMap((visual, index) => {
    if (!visual.use_sections.includes(section)) return [];
    return [{
      course_visual: index + 1,
      capability: visual.capability,
      mode: visual.create_section === section ? "create" : "reuse",
      relation: visual.relation,
      ...(visual.related_visual === undefined ? {} : { related_visual: visual.related_visual }),
    }];
  });
  const assignedRequestParts = (section: number) => (outline.request_coverage ?? [])
    .filter((item) => item.treatment === "teach" && item.sections.includes(section))
    .map((item) => ({
      request_part: item.request_part,
      text: fixedRequestParts[item.request_part - 1],
    }));

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
          course_context: compactModelContext(context),
          course_and_section: sectionPromptContext(outline, section),
          visuals_for_section: visualsForSection(section),
          assigned_request_parts: assignedRequestParts(section),
          ...(sectionErrors.has(section)
            ? { previous_validation_error: errorFeedback(sectionErrors.get(section)) }
            : {}),
        }),
        response_schema: buildLessonPlanSectionDraftJsonSchema(outline, section),
      });
      modelCalls += 1;
    } catch (error) {
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
      const previousError = sectionErrors.get(section);
      sectionErrors.set(section, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section,
        attempt,
        error: rejectionDetails(error),
      });
      if (unsupportedSectionResponse(error, previousError)) throw error;
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
        const previousError = sectionErrors.get(section);
        if (unsupportedSectionResponse(error, previousError)) throw error;
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

  // Section 1 normally comes from the combined response. If it was missing or
  // conflicts with the accepted outline, acceptSection regenerates only this
  // section through the ordinary exact-schema request.
  try {
    await acceptSection(1, bootstrappedFirstSection);
  } catch (error) {
    const learnerResponse = unsupportedSectionResponse(error, sectionErrors.get(1));
    if (!learnerResponse) throw error;
    return {
      disposition: "unsupported",
      learner_response: learnerResponse,
      model_calls: modelCalls,
    };
  }

  // Later sections keep the existing proven progressive path and are
  // published one by one while section 1 can already play.
  for (let section = 2; section <= outline.sections.length; section += 1) {
    try {
      await acceptSection(section);
    } catch (error) {
      const learnerResponse = unsupportedSectionResponse(error, sectionErrors.get(section));
      if (!learnerResponse) throw error;
      return {
        disposition: "unsupported",
        learner_response: learnerResponse,
        model_calls: modelCalls,
      };
    }
  }
  let compiled: CompiledLessonPlan | undefined;
  let compiledOutline: LessonPlanOutline | undefined;
  let compiledDrafts: LessonPlanSectionDraft[] | undefined;
  let programAdjustments: ReturnType<typeof sanitizeNonessentialVisuals>["adjustments"] = [];
  let finalError: unknown;
  for (let attempt = 1; attempt <= outline.sections.length * maxAttempts; attempt += 1) {
    try {
      const normalized = normalizeExecutableNumberInteractions(outline, drafts);
      const plan = assembleLessonPlan(normalized.outline, normalized.drafts, options.compile);
      compiled = compileAndValidateLessonPlan(plan, options.compile);
      compiledOutline = normalized.outline;
      compiledDrafts = normalized.drafts;
      programAdjustments = normalized.adjustments;
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
  for (const adjustment of programAdjustments) {
    await options.on_program_adjustment?.(adjustment);
  }
  return {
    ...compiled,
    outline: compiledOutline ?? outline,
    drafts: (compiledDrafts ?? drafts).map((draft) => structuredClone(draft)),
    model_calls: modelCalls,
    ...(stableCameraObservation ? { camera_observation: stableCameraObservation } : {}),
  };
}
