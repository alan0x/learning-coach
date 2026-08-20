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
  type LessonPlanSectionDraft,
  type LessonPlanVisualFeature,
} from "./lesson-plan.js";
import {
  compileAndValidateLessonPlan,
  LESSON_PLAN_SCENE_INITIAL_CAMERAS,
  type CompileLessonPlanOptions,
  type CompiledLessonPlan,
} from "./lesson-plan-compiler.js";
import {
  buildLessonPlanBootstrapJsonSchema,
  buildLessonPlanOutlineJsonSchema,
  buildLessonPlanSectionDraftJsonSchema,
  coerceLessonPlanOutlineModelNumbers,
  coerceLessonPlanSectionModelNumbers,
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
}

export interface LessonPlanModelRequest {
  label: "lesson-plan-bootstrap" | "lesson-plan-outline" | "lesson-plan-section";
  turn_id: string;
  system_prompt: string;
  prompt: string;
  response_schema: LessonPlanJsonSchema;
  max_output_tokens: number;
  part: "bootstrap" | "outline" | "section";
  section?: number;
  attempt: number;
}

export type LessonPlanModelCall = (request: LessonPlanModelRequest) => Promise<string>;

export interface GenerateLessonPlanOptions {
  max_attempts_per_part?: number;
  max_concurrency?: number;
  /** Ask for the outline and section 1 in the same provider request. */
  bootstrap_first_section?: boolean;
  compile?: CompileLessonPlanOptions;
  on_playable_prefix?: (event: {
    completed_sections: number;
    compiled: CompiledLessonPlan;
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

const OUTLINE_SYSTEM_PROMPT = `你负责设计一整节课的目录，不生成 OLL，也不填写任何执行 ID、执行组件名称或自由对象名称。
底部输入的问题始终要求一整节完整课程。课程可以有多节，每节可以有多段旁白、板书、动画和学生练习。
先在 course_visuals 中一次性列出整堂课真正需要的主要画面。每个画面只填写 required_features，描述它必须具备哪些受控特征；程序会从已安装、经过验证的画面能力中选择唯一实现。不要填写或猜测 capability。每项还要填写首次创建章节、会继续使用它的章节和它与其他画面的关系。具备同一组 required_features 的画面默认只能声明一个；后续章节继续观察时必须复用它，不能因为标题、坐标范围、相机、颜色或布局变化再声明一份。数学图、几何、3D、物理装置和已支持的几何重排都遵守同一规则。确实需要并排比较时才可为同一组 required_features 声明第二项，并用 comparison 和 related_visual 指向前面已经声明的数字位置；辅助画面使用 supporting，也必须指向前面已声明的相关画面。非画面板书、连接或组需要后续章节使用时，仍在对应章节的 reusable_items 中按位置声明。
最终总结只写总结文字；结尾聚焦哪些已经声明的可复用内容由程序选择，不要输出位置编号。显示标题和旁白不会被程序当作查找键。
第一批普通 visual 通常只绑定一个主要数值状态；circle_and_arc 可以按顺序绑定圆心角和半径，function_plot 可以让最多四个数值共同改变主曲线。一堂课仍可以有多个彼此独立的数值状态。
需要把几何图形切分、移动或重新拼合来证明面积关系时，required_features 必须同时包含 polygon_pieces、rigid_rearrangement 和 area_relation；程序会选择并验证实际构造。ordered_process_steps 只表示概念步骤或流程，没有数值输入，不能用它冒充会移动的几何图形。
如果用户明确要求的交互画面不在能力清单中，不要用错误画面冒充；可以改用文字和公式解释，但课程目标仍要忠实反映用户问题。
request_coverage 必须逐项覆盖输入的 request_parts。只有实际课程能够满足该项要求时才写 treatment="teach"，并填写会落实它的章节编号。文字讨论不能冒充用户明确要求但当前无法生成的画面或交互；这种情况必须写 treatment="unsupported"、空 sections 和具体 reason。
只返回符合响应 Schema 的 JSON。`;

const SECTION_SYSTEM_PROMPT = `你只编写课程目录指定的一节，不生成 OLL，也不填写任何执行 ID、变量名或自由对象名称。
assigned_request_parts 是课程目录分配给本节的用户原始要求。本节的旁白、板书或练习必须实际落实这些要求，不能只复述课程目录的目的。
课程目录已经确定的主要画面会作为根层 course_visual_creates 的必填属性出现。你只描述每个画面的教学内容、放在哪个 moment 和动作顺序；程序负责创建、编号和后续复用，不能在 moment 中重复创建这些画面。每个 moment 只把普通数学板书、笔记和其他动作写进响应 Schema 提供的清单。第一批普通板书创建分为 math_creates、note_creates；其他动作只使用 focuses、points，以及 Schema 提供时的 animations。Bootstrap 响应若仍提供 visual_creates，则只按该 Schema 填写。不要添加 Schema 没有提供的修改、连接、分组、强调或表情动作。每个动作的 order 是这一段里的总顺序，所有清单与该 moment 对应的主要画面合在一起后 order 不能重复。没有某类动作时返回空数组。
响应 Schema 中的小数使用 mantissa 和 scale 两个整数表示：-1.5 写成 {"mantissa":-15,"scale":1}，6.283 写成 {"mantissa":6283,"scale":3}。不要把小数写成字符串或普通 JSON 小数。
学生练习只写入响应 Schema 实际提供的清单。number_activities 表示数值练习，scene3d_activities 表示 3D 视角练习；每项的 order 表示所有已提供清单合并后的顺序。Schema 中出现但本节不需要的清单返回空数组。数值练习只填写 number 选择一个现有数值状态，并填写希望观察的目标值；程序会根据真实控件、范围和步长生成可执行的操作方式、可达到的目标和完成容差，不要自行填写控件类型、计算表达式或容差。
scene3d_activities 使用 view_preset 选择 top、front、right、left 或 isometric，不要自行计算相机角度或填写 3D 节点引用；程序会选择课程中真实存在的 3D 画面，并转换成运行时相机参数。
引用只能使用数字位置：本节已创建的内容、课程目录提前声明的 reusable_items，或宿主明确提供的位置。每个引用都必须填写 source、section、moment、item、host_reference 五个字段；local_* 使用 moment 和 item，其中 moment=0 明确表示当前 moment；reusable 使用 section 和 item；host 使用 host_reference。当前来源不用的其他数字字段写 0。
create 动作按出现顺序分别编号；连接和组也各自按出现顺序编号。不能引用尚未创建的本节内容或未来章节。
visuals_for_section 是课程目录已经确定的画面位置。mode=create 的画面由 course_visual_creates 中对应的必填属性描述，属性名和画面能力由程序给定；不要再次填写 capability 或画面编号。mode=reuse 表示程序会继续使用以前的同一画面，不得重新创建。每个普通 reusable_item 声明仍必须由类型完全匹配的 create、connect 或 group 动作填充一次。
create 的 placement 只描述相对方向，不填写 reference。程序会把它锚到最近已创建的内容；没有可用锚点时自动使用新区域。
每段旁白与这一刻的板书和动作写在同一个 moment 中。学生可见文字必须直接对当前学习者说话，不能出现“让学生……”之类的内部规划口吻。
course_visual_creates 中 numbers 的顺序由画面能力固定规定，不使用名称推断：circle_and_arc 最多填写两个数字位置，依次表示圆心角、半径。其他第一批画面能力最多填写一个数字位置；function_plot 最多四个。
geometric_rearrangement 的一个数字位置表示从初始排列到最终排列的进度；process_diagram 不接受 numbers，也不会产生滑杆或动画。
geometric_rearrangement 的 construction 只从响应 Schema 中选择：right_triangle_square 用四个直角三角形说明勾股面积关系；square_area_identity 用四块面积拼成边长 a+b 的正方形；triangle_to_rectangle 用两个全等直角三角形旋转拼成长方形。不要用 process_diagram 代替这些实际移动。
function_plot 只有一种公式表示：必须填写 parameters.expression_tokens。它是数学关系，不是 OLL 或运行时绑定；input 表示横轴自变量，number 表示课程目录中的数值位置，literal 表示常数，operator/function 表示运算。程序负责把它解析成曲线、动点、变量绑定和坐标范围。例：y=(x-number1)^2+number2 依次写 input、number1、subtract、literal2、power、number2、add。若 token 中出现 number，numbers 必须正好列出这些位置，表示它们改变整条曲线；若 token 中没有 number 且 numbers 只列一个位置，该数值表示沿曲线移动的采样点。画 f(n)=(1+1/n)^n 时，公式依次写 literal1、literal1、input、divide、add、input、power，numbers 可填写 n 的位置，让程序生成沿曲线移动的点。
函数图中的 input 永远表示横轴自变量；number 永远表示额外的课程控件参数，不能用 number 代替横轴自变量。不要填写 expression 或 expressions，也不要自行保证坐标轴覆盖控件范围；这些属于程序编译工作。
只返回符合响应 Schema 的 JSON。`;

const BOOTSTRAP_SYSTEM_PROMPT = `${OUTLINE_SYSTEM_PROMPT}

你还必须在同一次返回中写出课程第一节。返回对象只有 outline 和 first_section 两个字段。outline 遵守上面的课程目录规则；first_section 遵守下面的单节规则，并且只能使用同一返回中 outline 第一节已经声明的数字位置、画面位置和可复用内容。不要为了第一节重复创建同一种主要画面。

${SECTION_SYSTEM_PROMPT}`;

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

function lowerModelOutline(value: unknown): unknown {
  const root = pruneModelNulls(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root as Record<string, unknown>;
  if (Array.isArray(candidate.numbers)) {
    candidate.numbers = candidate.numbers.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const number = { ...(entry as Record<string, unknown>) };
      if (typeof number.unit === "string" && !number.unit.trim()) delete number.unit;
      if (typeof number.label === "string" && !number.label.trim()) delete number.label;
      if (number.student_control === undefined
        && typeof number.min === "number"
        && Number.isFinite(number.min)
        && typeof number.max === "number"
        && Number.isFinite(number.max)
        && number.max > number.min) {
        const rawStep = (number.max - number.min) / 100;
        const precision = 10 ** 6;
        number.student_control = {
          kind: "slider",
          step: Math.max(Math.round(rawStep * precision) / precision, 1 / precision),
        };
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

function lowerModelMathTokens(value: unknown, path: string): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const token = { ...(entry as Record<string, unknown>) };
    const tokenPath = `${path}[${index}]`;
    if (token.kind === "input" || token.kind === "negate") return { kind: token.kind };
    if (token.kind === "number") return { kind: "number", number: token.number };
    if (token.kind === "literal") {
      return {
        kind: "literal",
        value: lowerIntegerDecimal(token, "literal", tokenPath),
      };
    }
    if (token.kind === "constant" || token.kind === "function") {
      return { kind: token.kind, name: token.name };
    }
    if (token.kind === "operator") return { kind: "operator", operator: token.operator };
    return token;
  });
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
  if (parameters.expression_tokens !== undefined) {
    parameters.expression_tokens = lowerModelMathTokens(
      parameters.expression_tokens,
      "$lessonPlanSection.visual.parameters.expression_tokens",
    );
  }
  if (typeof content.title === "string" && parameters.title === undefined) parameters.title = content.title;
  if (typeof capability === "string" && capability in LESSON_PLAN_VISUAL_PARAMETER_NAMES) {
    const allowedParameters = new Set(
      LESSON_PLAN_VISUAL_PARAMETER_NAMES[capability as keyof typeof LESSON_PLAN_VISUAL_PARAMETER_NAMES],
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
  if (capability === "function_plot"
    && Array.isArray(parameters.expression_tokens)
    && validNumbers.length === 0) {
    validNumbers = [...new Set(parameters.expression_tokens.flatMap((token) => (
      token && typeof token === "object" && !Array.isArray(token)
        && (token as Record<string, unknown>).kind === "number"
        && Number.isInteger((token as Record<string, unknown>).number)
        ? [Number((token as Record<string, unknown>).number)]
        : []
    )))].filter((number) => number >= 1 && number <= numberCount).slice(0, numberLimit);
  }
  if (validNumbers.length === 0
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
  if (actionName === "revise" || actionName === "emphasize" || actionName === "point_at") {
    lowered.reference = lowerModelReference(lowered.reference, currentMoment);
  }
  if (actionName === "connect") {
    lowered.from_ref = lowerModelReference(lowered.from_ref, currentMoment);
    lowered.to_ref = lowerModelReference(lowered.to_ref, currentMoment);
  }
  if (actionName === "group" && Array.isArray(lowered.members)) {
    lowered.members = lowered.members.map((reference) => lowerModelReference(reference, currentMoment));
  }
  if (actionName === "focus" && Array.isArray(lowered.references)) {
    lowered.references = lowered.references.map((reference) => lowerModelReference(reference, currentMoment));
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
    if (!preset
      || !Number.isInteger(lowered.angular_tolerance_degrees)
      || !Number.isInteger(lowered.zoom_tolerance_percent)) {
      throw new LessonPlanError("LESSON_PLAN_ACTIVITY", path, "expected a supported 3D view preset and integer tolerances");
    }
    delete lowered.view_preset;
    let angularTolerance = Math.min(Number(lowered.angular_tolerance_degrees), 10);
    const zoomTolerance = Math.min(Number(lowered.zoom_tolerance_percent), 15);
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
    delete lowered.angular_tolerance_degrees;
    delete lowered.zoom_tolerance_percent;
    Object.assign(lowered, {
      match: "view_direction",
      ...preset,
      angular_tolerance: angularTolerance * Math.PI / 180,
      zoom_tolerance: zoomTolerance / 100,
    });
  }
  return lowered;
}

function lowerModelSectionDraft(
  value: unknown,
  outline: LessonPlanOutline,
  expectedSection: number,
  requireFixedCourseVisuals = false,
): LessonPlanSectionDraft {
  const root = pruneModelNulls(value);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection", "expected an object");
  }
  const candidate = root as Record<string, unknown>;
  const allowedRoot = new Set(["version", "section", "moments", "course_visual_creates", "number_activities", "scene3d_activities"]);
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
  if (requireFixedCourseVisuals
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
    if (requireFixedCourseVisuals
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
    };
    for (const key of Object.keys(moment)) {
      if (!momentKeys.has(key)) throw new LessonPlanError("LESSON_PLAN_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
    }
    const ordered: Array<{ order: number; action: Record<string, unknown> }> = [];
    const seenOrders = new Set<number>();
    for (const [collectionName, descriptor] of Object.entries(modelActionCollections)) {
      const collection = moment[collectionName];
      if (collection === undefined
        && collectionName === "visual_creates"
        && outline.sections[expectedSection - 1]?.allowed_capabilities.length === 0) {
        continue;
      }
      if (collection === undefined && collectionName === "animations" && (outline.numbers?.length ?? 0) === 0) {
        continue;
      }
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
        const order = action.order;
        if (!Number.isInteger(order) || Number(order) < 1 || Number(order) > 48) {
          throw new LessonPlanError("LESSON_PLAN_ACTION_ORDER", `${entryPath}.order`, "expected an integer from 1 to 48");
        }
        if (seenOrders.has(Number(order))) {
          throw new LessonPlanError("LESSON_PLAN_ACTION_ORDER", `${entryPath}.order`, "action order is duplicated");
        }
        seenOrders.add(Number(order));
        delete action.order;
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
          order: Number(order),
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
  const activityOrders = new Set<number>();
  const activities: Array<{ order: number; activity: Record<string, unknown> }> = [];
  const collectActivities = (values: unknown[], kind: "number_target" | "scene3d_view", path: string): void => {
    values.forEach((activity, index) => {
      const itemPath = `${path}[${index}]`;
      if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
        throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", itemPath, "expected an object");
      }
      let lowered = { ...(activity as Record<string, unknown>) };
      const order = lowered.order;
      if (!Number.isInteger(order) || Number(order) < 1 || Number(order) > 16 || activityOrders.has(Number(order))) {
        throw new LessonPlanError("LESSON_PLAN_ACTIVITY_ORDER", `${itemPath}.order`, "expected a unique integer from 1 to 16");
      }
      activityOrders.add(Number(order));
      delete lowered.order;
      if (kind === "number_target" && lowered.reference !== undefined) {
        lowered.reference = lowerModelReference(lowered.reference, candidate.moments.length);
      }
      lowered = lowerModelActivityNumbers(lowered, kind, itemPath, outline, expectedSection);
      activities.push({ order: Number(order), activity: { kind, ...lowered } });
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
    const presentationReference = (value: unknown): unknown => {
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
      const needsVisual = part && typeof part === "object" && !Array.isArray(part)
        && (part as Record<string, unknown>).kind === "capability";
      if (!reference) {
        const fallback = needsVisual ? latestVisualReference : latestBoardReference;
        if (!fallback) return undefined;
        reference = structuredClone(fallback);
        capability = needsVisual ? latestVisualCapability : undefined;
      }
      if (needsVisual) {
        const role = (part as Record<string, unknown>).role;
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
        const reference = presentationReference(action.reference);
        if (reference === undefined) return;
        action.reference = reference;
      } else if (action.action === "focus" && Array.isArray(action.references)) {
        const references = action.references.map(presentationReference).filter((reference) => reference !== undefined);
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

async function mapWithConcurrency<T>(
  count: number,
  concurrency: number,
  work: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < count) {
      const index = next;
      next += 1;
      results[index] = await work(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, () => worker()));
  return results;
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
  return compileAndValidateLessonPlan(assembleLessonPlan(prefixOutline, drafts, options), options);
}

export async function generateLessonPlanWithModel(
  model: LessonPlanModelCall,
  input: LessonPlanGenerationInput,
  options: GenerateLessonPlanOptions = {},
): Promise<GeneratedLessonPlan> {
  const maxAttempts = positiveInteger(options.max_attempts_per_part, 3, "max_attempts_per_part");
  const concurrency = positiveInteger(options.max_concurrency, 1, "max_concurrency");
  const context = inputContext(input);
  const fixedRequestParts = requestParts(input);
  const bootstrapFirstSection = options.bootstrap_first_section === true;
  let modelCalls = 0;
  let outline: LessonPlanOutline | undefined;
  let bootstrappedFirstSection: LessonPlanSectionDraft | undefined;
  let outlineError: unknown;
  const sectionErrors = new Map<number, unknown>();
  const sectionAttempts = new Map<number, number>();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await model({
      label: bootstrapFirstSection ? "lesson-plan-bootstrap" : "lesson-plan-outline",
      part: bootstrapFirstSection ? "bootstrap" : "outline",
      attempt,
      turn_id: input.turn_id,
      system_prompt: bootstrapFirstSection ? BOOTSTRAP_SYSTEM_PROMPT : OUTLINE_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        course: context,
        request_parts: fixedRequestParts.map((text, index) => ({ request_part: index + 1, text })),
        available_visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability) => ({
          required_features: [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].required_features],
          number_inputs: [...LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs],
          guidance: LESSON_PLAN_CAPABILITY_REGISTRY[capability].model_guidance,
        })),
        ...(bootstrapFirstSection ? {
          first_section_to_write: 1,
          first_section_rule: "first_section must implement outline.sections[0] and may only use positions declared by the returned outline",
        } : {}),
        ...(outlineError ? { previous_validation_error: errorFeedback(outlineError) } : {}),
      }, null, 2),
      response_schema: bootstrapFirstSection
        ? buildLessonPlanBootstrapJsonSchema(fixedRequestParts.length)
        : buildLessonPlanOutlineJsonSchema(fixedRequestParts.length),
      max_output_tokens: bootstrapFirstSection ? 16_384 : 8_192,
    });
    modelCalls += 1;
    try {
      const parsed = pruneModelNulls(parseModelJson(raw, bootstrapFirstSection
        ? "lessonPlanBootstrap"
        : "lessonPlanOutline"));
      if (bootstrapFirstSection && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanBootstrap",
          "bootstrap response must be an object",
        );
      }
      const rawOutline = bootstrapFirstSection
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
      if (bootstrapFirstSection) {
        try {
          bootstrappedFirstSection = lowerModelSectionDraft(
            coerceLessonPlanSectionModelNumbers(
              (parsed as Record<string, unknown>).first_section,
              outline,
              1,
            ),
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
    const raw = await model({
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
      }, null, 2),
      response_schema: buildLessonPlanSectionDraftJsonSchema(outline, section),
      max_output_tokens: 12_288,
    });
    modelCalls += 1;
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

  let drafts: LessonPlanSectionDraft[];
  if (concurrency === 1) {
    drafts = [];
    for (let section = 1; section <= outline.sections.length; section += 1) {
      let candidate = section === 1 ? bootstrappedFirstSection : undefined;
      while (true) {
        candidate ??= await generateSection(section);
        drafts[section - 1] = candidate;
        try {
          const prefix = compilePrefix(outline, drafts.slice(0, section), options.compile);
          await options.on_playable_prefix?.({ completed_sections: section, compiled: prefix });
          break;
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
    }
  } else {
    drafts = await mapWithConcurrency(
      outline.sections.length,
      concurrency,
      (index) => index === 0 && bootstrappedFirstSection
        ? Promise.resolve(bootstrappedFirstSection)
        : generateSection(index + 1),
    );
  }
  let compiled: CompiledLessonPlan | undefined;
  let finalError: unknown;
  for (let attempt = 1; attempt <= outline.sections.length * maxAttempts; attempt += 1) {
    try {
      const plan = assembleLessonPlan(outline, drafts, options.compile);
      compiled = compileAndValidateLessonPlan(plan, options.compile);
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
    outline,
    drafts: drafts.map((draft) => structuredClone(draft)),
    model_calls: modelCalls,
  };
}
