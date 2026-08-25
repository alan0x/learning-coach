export const LESSON_PLAN_VERSION = "0.1" as const;

export const PROCESS_DIAGRAM_CONTRACT = {
  min_steps: 2,
  max_steps: 8,
  max_step_characters: 80,
  max_title_characters: 120,
} as const;

/**
 * The single program-owned declaration for every deterministic visual.
 * Provider schemas, model catalogs, reference parts, numeric-input limits,
 * compiler identity, and coverage tests are all derived from this registry.
 */
export const LESSON_PLAN_CAPABILITY_REGISTRY = {
  function_plot: {
    parts: ["whole", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["curve_parameter_1", "curve_parameter_2", "curve_parameter_3", "curve_parameter_4"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "expression", "expressions", "expression_tokens", "curve_label", "curve_labels", "x_min", "x_max", "y_min", "y_max"],
    model_parameter_names: ["title", "expression", "expressions", "expression_tokens", "curve_label", "curve_labels"],
    required_model_schema_parameters: ["formulas"],
    semantic_parameters: ["expression", "expressions", "expression_tokens"],
    output_kinds: ["plot"],
    student_controls: ["slider"],
    required_features: ["cartesian_function_curve"],
    model_guidance: "二维笛卡尔函数曲线；数值可移动曲线上的点或改变整条曲线",
  },
  unit_circle_projection: {
    parts: ["whole", "unit_circle", "moving_point", "radius", "projection_line", "primary_curve", "primary_control"],
    number_inputs: ["angle"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title", "projection"],
    model_parameter_names: ["title", "projection"],
    required_model_schema_parameters: ["projection"],
    semantic_parameters: ["projection"],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["unit_circle", "projection", "cartesian_function_curve"],
    model_guidance: "单位圆动点、投影线和正弦或余弦曲线共享同一个角度",
  },
  circle_and_arc: {
    parts: ["whole", "circle", "arc", "radius", "primary_control"],
    number_inputs: ["angle", "radius"],
    number_input_policies: [{ kind: "angle" }, { kind: "positive" }],
    parameter_names: ["title", "radius", "angle"],
    model_parameter_names: ["title", "radius", "angle"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "angle"],
    output_kinds: ["geometry"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["circle", "arc"],
    model_guidance: "圆、圆心角、半径和圆弧；两个数值依次控制角度和半径",
  },
  spring_and_mass: {
    parts: ["whole", "spring", "mass", "equilibrium", "force_arrow", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["phase"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider"],
    required_features: ["spring_mass", "cartesian_function_curve"],
    model_guidance: "弹簧、物体、平衡位置、回复力和余弦变化曲线共享相位",
  },
  cube_with_section: {
    parts: ["whole", "solid", "vertex", "edge", "face", "section", "primary_control"],
    number_inputs: ["section_height"],
    number_input_policies: [{ kind: "bounded", min: -1, max: 1 }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["solid_3d", "section_plane"],
    model_guidance: "可旋转正方体、顶点、棱、面和可变水平截面",
  },
  function_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "samples", "section_axis", "x_min", "x_max", "y_min", "y_max"],
    model_parameter_names: ["title", "expression", "section_axis"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "section_axis"],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["function_surface_3d", "section_plane"],
    model_guidance: "可旋转三维函数曲面、可变截面和真实交线",
  },
  implicit_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "level", "section_axis"],
    model_parameter_names: ["title", "expression", "level", "section_axis"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "level", "section_axis"],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["implicit_surface_3d", "section_plane"],
    model_guidance: "三变量隐式曲面 F(x,y,z)=c，以及垂直于 x、y 或 z 轴的可变截面和真实交线",
  },
  coordinate_circle: {
    parts: ["whole", "circle", "center", "radius", "primary_control"],
    number_inputs: ["radius"],
    number_input_policies: [{ kind: "positive" }],
    parameter_names: ["title", "radius", "center_x", "center_y"],
    model_parameter_names: ["title", "radius", "center_x", "center_y"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "center_x", "center_y"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["coordinate_circle"],
    model_guidance: "坐标系中的圆，可用数值改变半径",
  },
  geometric_rearrangement: {
    parts: ["whole", "target_shape", "outer_square", "piece_1", "piece_2", "piece_3", "piece_4", "central_area", "primary_control"],
    number_inputs: ["progress"],
    number_input_policies: [{ kind: "normalized_progress" }],
    parameter_names: ["title", "construction", "leg_a", "leg_b"],
    model_parameter_names: ["title", "construction", "leg_a", "leg_b"],
    required_model_schema_parameters: ["construction"],
    parameter_options: {
      construction: ["right_triangle_square", "square_area_identity", "triangle_to_rectangle"],
    },
    semantic_parameters: ["construction", "leg_a", "leg_b"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["polygon_pieces", "rigid_rearrangement", "area_relation"],
    model_guidance: "经过验证的多边形拆分与刚体重排，用进度数值控制移动",
  },
  process_diagram: {
    parts: ["whole", "first_step", "current_step", "last_step"],
    number_inputs: [],
    number_input_policies: [],
    parameter_names: ["title", "steps"],
    model_parameter_names: ["title", "steps"],
    required_model_schema_parameters: ["steps"],
    semantic_parameters: ["steps"],
    output_kinds: ["diagram"],
    student_controls: [],
    required_features: ["ordered_process_steps"],
    model_guidance: "概念或步骤流程图；没有几何移动，也不接受数值输入",
  },
} as const;

export type LessonPlanCapability = keyof typeof LESSON_PLAN_CAPABILITY_REGISTRY;
export type LessonPlanVisualFeature = typeof LESSON_PLAN_CAPABILITY_REGISTRY[LessonPlanCapability]["required_features"][number];

export const LESSON_PLAN_CAPABILITY_NAMES = Object.keys(LESSON_PLAN_CAPABILITY_REGISTRY) as LessonPlanCapability[];
export const LESSON_PLAN_VISUAL_FEATURES = [...new Set(
  LESSON_PLAN_CAPABILITY_NAMES.flatMap((name) => [...LESSON_PLAN_CAPABILITY_REGISTRY[name].required_features]),
)] as LessonPlanVisualFeature[];
export const LESSON_PLAN_CAPABILITIES = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].parts]),
) as Record<LessonPlanCapability, readonly string[]>;
export const LESSON_PLAN_CAPABILITY_NUMBER_INPUTS = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].number_inputs]),
) as Record<LessonPlanCapability, readonly string[]>;
export const LESSON_PLAN_CAPABILITY_NUMBER_LIMITS = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].number_inputs.length]),
) as Record<LessonPlanCapability, number>;

export function matchLessonPlanCapability(features: readonly LessonPlanVisualFeature[]): LessonPlanCapability {
  const requested = [...new Set(features)];
  if (requested.length === 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
      "$lessonPlanOutline.course_visuals.required_features",
      "a visual requires at least one controlled feature",
    );
  }
  const candidates = LESSON_PLAN_CAPABILITY_NAMES
    .map((capability) => {
      const provided: readonly string[] = LESSON_PLAN_CAPABILITY_REGISTRY[capability].required_features;
      return {
        capability,
        extra: 0,
        matches: provided.length === requested.length
          && requested.every((feature) => provided.includes(feature)),
      };
    })
    .filter((candidate) => candidate.matches)
    .sort((left, right) => left.extra - right.extra || left.capability.localeCompare(right.capability));
  if (candidates.length === 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
      "$lessonPlanOutline.course_visuals.required_features",
      `no installed visual capability provides: ${requested.join(", ")}`,
    );
  }
  const best = candidates[0]!;
  const equallySpecific = candidates.filter((candidate) => candidate.extra === best.extra);
  if (equallySpecific.length > 1) {
    throw new LessonPlanError(
      "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
      "$lessonPlanOutline.course_visuals.required_features",
      `visual requirements are ambiguous between: ${equallySpecific.map((candidate) => candidate.capability).join(", ")}`,
    );
  }
  return best.capability;
}
export type LessonPlanTiming = "before_speech" | "during_speech" | "after_speech";
export type LessonPlanDelivery = "neutral" | "patient" | "encouraging" | "careful" | "emphatic";
export type LessonPlanBoardKind = "text" | "math" | "shape" | "note" | "table" | "image" | "visual";
export type LessonPlanReusableKind = "board_item" | "connection" | "group";
export type LessonPlanEmphasis = "focus" | "supporting" | "warning" | "resolved";
export type LessonPlanTeacherExpression = "neutral" | "encouraging" | "careful" | "celebrating";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface LessonPlanNumber {
  initial: number;
  min: number;
  max: number;
  label?: string;
  unit?: string;
  student_control?: { kind: "slider"; step?: number };
}

export type LessonPlanMathToken =
  | { kind: "input" }
  | { kind: "number"; number: number }
  | { kind: "literal"; value: number }
  | { kind: "constant"; name: "pi" | "e" }
  | { kind: "negate" }
  | {
    kind: "operator";
    operator: "add" | "subtract" | "multiply" | "divide" | "power";
  }
  | {
    kind: "function";
    name: "abs" | "acos" | "asin" | "atan" | "ceil" | "cos" | "exp"
      | "floor" | "ln" | "log" | "round" | "sin" | "sqrt" | "tan";
  };

export type LessonPlanMathExpression = LessonPlanMathToken[];

export type LessonPlanPartReference =
  | { kind: "capability"; role: string }
  | { kind: "index"; index: number };

export type LessonPlanReference =
  | {
    source: "local_board_item" | "local_connection" | "local_group";
    moment: number;
    item: number;
    part?: LessonPlanPartReference;
  }
  | {
    source: "reusable";
    section: number;
    item: number;
    part?: LessonPlanPartReference;
  }
  | {
    source: "host";
    reference: number;
    part?: LessonPlanPartReference;
  };

export interface LessonPlanPlacement {
  relation: "new_region" | "below" | "above" | "left_of" | "right_of" | "near" | "inside" | "overlay";
  reference?: LessonPlanReference;
  align?: "start" | "center" | "end";
  gap?: "tight" | "normal" | "wide";
}

export interface LessonPlanVisualContent {
  capability: LessonPlanCapability;
  parameters?: Record<string, JsonValue>;
  numbers?: number[];
}

export type LessonPlanBoardContent =
  | { text: string }
  | { latex: string }
  | { title: string; items: string[] }
  | { columns: string[]; rows: Array<Array<string | number>> }
  | { resource: number; alt?: string }
  | LessonPlanVisualContent;

export interface LessonPlanCreateAction {
  action: "create";
  kind: LessonPlanBoardKind;
  role: string;
  content: LessonPlanBoardContent;
  timing?: LessonPlanTiming;
  placement: LessonPlanPlacement;
  reusable_item?: number;
  /** Program-authored only: keep an explicitly requested comparison view separate. */
  distinct_visual?: boolean;
}

export interface LessonPlanReviseAction {
  action: "revise";
  reference: LessonPlanReference;
  kind: LessonPlanBoardKind;
  content: LessonPlanBoardContent;
  reason: string;
  timing?: LessonPlanTiming;
}

export interface LessonPlanEmphasizeAction {
  action: "emphasize";
  reference: LessonPlanReference;
  emphasis: LessonPlanEmphasis;
  timing?: LessonPlanTiming;
}

export interface LessonPlanConnectAction {
  action: "connect";
  from_ref: LessonPlanReference;
  to_ref: LessonPlanReference;
  relation: string;
  label?: string;
  timing?: LessonPlanTiming;
  reusable_item?: number;
}

export interface LessonPlanGroupAction {
  action: "group";
  role: string;
  label: string;
  members: LessonPlanReference[];
  timing?: LessonPlanTiming;
  reusable_item?: number;
}

export interface LessonPlanFocusAction {
  action: "focus";
  references: LessonPlanReference[];
  intent: string;
  timing?: LessonPlanTiming;
}

export interface LessonPlanAnimateAction {
  action: "animate";
  number: number;
  end_value: number;
  easing?: "linear" | "ease_in_out";
  duration_intent?: "brief" | "normal" | "extended";
  timing?: LessonPlanTiming;
}

export interface LessonPlanPointAtAction {
  action: "point_at";
  reference: LessonPlanReference;
  timing?: LessonPlanTiming;
}

export interface LessonPlanTeacherExpressionAction {
  action: "teacher_expression";
  expression: LessonPlanTeacherExpression;
  timing?: LessonPlanTiming;
}

export type LessonPlanAction =
  | LessonPlanCreateAction
  | LessonPlanReviseAction
  | LessonPlanEmphasizeAction
  | LessonPlanConnectAction
  | LessonPlanGroupAction
  | LessonPlanFocusAction
  | LessonPlanPointAtAction
  | LessonPlanTeacherExpressionAction
  | LessonPlanAnimateAction;

export interface LessonPlanMoment {
  narration?: string;
  delivery?: LessonPlanDelivery;
  actions: LessonPlanAction[];
}

export interface LessonPlanReusableItem {
  kind: LessonPlanReusableKind;
  board_kind?: LessonPlanBoardKind;
  capability?: LessonPlanCapability;
}

export type LessonPlanStudentActivity =
  | {
    kind: "number_target";
    prompt: string;
    number_controls: Array<{
      number: number;
      controls: Array<"slider" | "geometry_point">;
    }>;
    expression?: LessonPlanMathExpression;
    value: number;
    tolerance: number;
    hints: string[];
    hint_after_attempts?: number;
    success_message?: string;
  }
  | {
    kind: "scene3d_view";
    reference: LessonPlanReference;
    prompt: string;
    controls: Array<"orbit" | "zoom" | "preset" | "reset">;
    match: "view_direction" | "camera_pose";
    yaw: number;
    pitch: number;
    zoom: number;
    angular_tolerance: number;
    zoom_tolerance: number;
    hints: string[];
    hint_after_attempts?: number;
    success_message?: string;
  };

export interface LessonPlanSection {
  purpose: string;
  reusable_items?: LessonPlanReusableItem[];
  moments: LessonPlanMoment[];
  student_activities?: LessonPlanStudentActivity[];
}

export interface LessonPlan {
  version: typeof LESSON_PLAN_VERSION;
  title: string;
  goals: string[];
  teaching_strategies?: string[];
  numbers?: LessonPlanNumber[];
  sections: LessonPlanSection[];
  close: { summary: string; focus: LessonPlanReference[] };
}

export interface LessonPlanOutline {
  version: typeof LESSON_PLAN_VERSION;
  title: string;
  goals: string[];
  teaching_strategies?: string[];
  numbers?: LessonPlanNumber[];
  request_coverage?: Array<{
    request_part: number;
    treatment: "teach" | "unsupported";
    sections: number[];
    reason?: string;
  }>;
  course_visuals?: Array<{
    capability: LessonPlanCapability;
    create_section: number;
    use_sections: number[];
    relation: "primary" | "supporting" | "comparison";
    related_visual?: number;
    reusable_item: number;
  }>;
  sections: Array<{
    purpose: string;
    allowed_capabilities: LessonPlanCapability[];
    reusable_items?: LessonPlanReusableItem[];
  }>;
  close: { summary: string; focus: LessonPlanReference[] };
}

export interface LessonPlanSectionDraft {
  version: typeof LESSON_PLAN_VERSION;
  section: number;
  moments: LessonPlanMoment[];
  student_activities?: LessonPlanStudentActivity[];
}

export interface LessonPlanHostReference {
  target_id: string;
  type: "node" | "connection" | "group";
  label?: string;
  parts?: string[];
}

export interface ResolveLessonPlanOptions {
  host_references?: LessonPlanHostReference[];
  image_resources?: Array<{ asset_id: string }>;
}

export interface ResolvedLessonPlanReference {
  path: string;
  target_id: string;
  authoring_alias: string;
  target_kind: "board_item" | "connection" | "group" | "host";
  board_kind?: LessonPlanBoardKind;
  capability?: LessonPlanCapability;
  part?: LessonPlanPartReference;
}

export interface ResolvedLessonPlan {
  plan: LessonPlan;
  numbers: Array<{ index: number; variable_id: string }>;
  sections: Array<{
    index: number;
    section_id: string;
    moments: Array<{
      index: number;
      moment_id: string;
      board_item_ids: string[];
      connection_ids: string[];
      group_ids: string[];
    }>;
    reusable_items: Array<{
      index: number;
      target_id: string;
      target_kind: LessonPlanReusableKind;
    }>;
  }>;
  references: ResolvedLessonPlanReference[];
}

export class LessonPlanError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "LessonPlanError";
    this.code = code;
    this.path = path;
  }
}

const FORBIDDEN_PARAMETER_KEYS = new Set([
  "id", "as", "key", "target", "targets", "anchor", "variable", "variables",
  "binding", "bindings", "members", "node_id", "target_id", "action_id",
  "lesson_id", "board_id", "base_revision",
]);

const timings = new Set<LessonPlanTiming>(["before_speech", "during_speech", "after_speech"]);
const deliveries = new Set<LessonPlanDelivery>(["neutral", "patient", "encouraging", "careful", "emphatic"]);
const boardKinds = new Set<LessonPlanBoardKind>(["text", "math", "shape", "note", "table", "image", "visual"]);
const emphasisValues = new Set<LessonPlanEmphasis>(["focus", "supporting", "warning", "resolved"]);
const teacherExpressions = new Set<LessonPlanTeacherExpression>(["neutral", "encouraging", "careful", "celebrating"]);

function fail(code: string, path: string, message: string): never {
  throw new LessonPlanError(code, path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("LESSON_PLAN_TYPE", path, "expected an object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail("LESSON_PLAN_TYPE", path, "expected an array");
  return value;
}

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail("LESSON_PLAN_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
  }
}

function nonEmptyString(value: unknown, path: string, max = 1_200): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    fail("LESSON_PLAN_STRING", path, `expected a non-empty string of at most ${max} characters`);
  }
  return value;
}

function optionalString(value: unknown, path: string, max = 1_200): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, path, max);
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("LESSON_PLAN_NUMBER", path, "expected a finite number");
  return value;
}

function positiveIndex(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) fail("LESSON_PLAN_INDEX", path, "expected a positive integer index");
  return value as number;
}

function optionalTiming(value: unknown, path: string): LessonPlanTiming | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !timings.has(value as LessonPlanTiming)) fail("LESSON_PLAN_TIMING", path, "unsupported timing");
  return value as LessonPlanTiming;
}

function validateParameters(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    finiteNumber(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateParameters(item, `${path}[${index}]`));
    return;
  }
  const object = record(value, path);
  for (const [key, item] of Object.entries(object)) {
    if (FORBIDDEN_PARAMETER_KEYS.has(key) || key.endsWith("_id")) {
      fail("LESSON_PLAN_MODEL_ID", `${path}.${key}`, "business identity fields are not allowed in model-authored parameters");
    }
    validateParameters(item, `${path}.${key}`);
  }
}

function validateMathExpression(
  value: unknown,
  path: string,
  numberCount: number,
  allowInput = false,
): number[] {
  const tokens = array(value, path);
  if (tokens.length === 0 || tokens.length > 128) fail("LESSON_PLAN_EXPRESSION", path, "expected 1 to 128 expression tokens");
  let stackDepth = 0;
  const numbers = new Set<number>();
  tokens.forEach((entry, index) => {
    const tokenPath = `${path}[${index}]`;
    const token = record(entry, tokenPath);
    const kind = token.kind;
    if (kind === "input") {
      allowedKeys(token, ["kind"], tokenPath);
      if (!allowInput) fail("LESSON_PLAN_EXPRESSION", tokenPath, "an independent input is not allowed here");
      stackDepth += 1;
    } else if (kind === "number") {
      allowedKeys(token, ["kind", "number"], tokenPath);
      const number = positiveIndex(token.number, `${tokenPath}.number`);
      if (number > numberCount) fail("LESSON_PLAN_NUMBER_REFERENCE", `${tokenPath}.number`, "number reference is unavailable");
      numbers.add(number);
      stackDepth += 1;
    } else if (kind === "literal") {
      allowedKeys(token, ["kind", "value"], tokenPath);
      finiteNumber(token.value, `${tokenPath}.value`);
      stackDepth += 1;
    } else if (kind === "constant") {
      allowedKeys(token, ["kind", "name"], tokenPath);
      if (!["pi", "e"].includes(String(token.name))) fail("LESSON_PLAN_EXPRESSION", `${tokenPath}.name`, "unsupported constant");
      stackDepth += 1;
    } else if (kind === "negate") {
      allowedKeys(token, ["kind"], tokenPath);
      if (stackDepth < 1) fail("LESSON_PLAN_EXPRESSION", tokenPath, "negate requires one earlier value");
    } else if (kind === "operator") {
      allowedKeys(token, ["kind", "operator"], tokenPath);
      if (!["add", "subtract", "multiply", "divide", "power"].includes(String(token.operator))) fail("LESSON_PLAN_EXPRESSION", `${tokenPath}.operator`, "unsupported operator");
      if (stackDepth < 2) fail("LESSON_PLAN_EXPRESSION", tokenPath, "binary operator requires two earlier values");
      stackDepth -= 1;
    } else if (kind === "function") {
      allowedKeys(token, ["kind", "name"], tokenPath);
      if (!["abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "ln", "log", "round", "sin", "sqrt", "tan"].includes(String(token.name))) fail("LESSON_PLAN_EXPRESSION", `${tokenPath}.name`, "unsupported function");
      if (stackDepth < 1) fail("LESSON_PLAN_EXPRESSION", tokenPath, "function requires one earlier value");
    } else {
      fail("LESSON_PLAN_EXPRESSION", `${tokenPath}.kind`, "unsupported expression token");
    }
  });
  if (stackDepth !== 1) fail("LESSON_PLAN_EXPRESSION", path, "expression tokens must produce exactly one result");
  return [...numbers];
}

function capability(value: unknown, path: string): LessonPlanCapability {
  if (typeof value !== "string" || !(value in LESSON_PLAN_CAPABILITIES)) {
    fail("LESSON_PLAN_CAPABILITY", path, "unsupported capability");
  }
  return value as LessonPlanCapability;
}

function validatePart(value: unknown, path: string): LessonPlanPartReference {
  const part = record(value, path);
  const kind = part.kind;
  if (kind === "capability") {
    allowedKeys(part, ["kind", "role"], path);
    return { kind, role: nonEmptyString(part.role, `${path}.role`, 80) };
  }
  if (kind === "index") {
    allowedKeys(part, ["kind", "index"], path);
    return { kind, index: positiveIndex(part.index, `${path}.index`) };
  }
  fail("LESSON_PLAN_PART", `${path}.kind`, "unsupported part reference");
}

function validateReference(value: unknown, path: string): LessonPlanReference {
  const ref = record(value, path);
  const part = ref.part === undefined ? undefined : validatePart(ref.part, `${path}.part`);
  if (ref.source === "local_board_item" || ref.source === "local_connection" || ref.source === "local_group") {
    allowedKeys(ref, ["source", "moment", "item", "part"], path);
    return {
      source: ref.source,
      moment: positiveIndex(ref.moment, `${path}.moment`),
      item: positiveIndex(ref.item, `${path}.item`),
      ...(part ? { part } : {}),
    };
  }
  if (ref.source === "reusable") {
    allowedKeys(ref, ["source", "section", "item", "part"], path);
    return {
      source: "reusable",
      section: positiveIndex(ref.section, `${path}.section`),
      item: positiveIndex(ref.item, `${path}.item`),
      ...(part ? { part } : {}),
    };
  }
  if (ref.source === "host") {
    allowedKeys(ref, ["source", "reference", "part"], path);
    return {
      source: "host",
      reference: positiveIndex(ref.reference, `${path}.reference`),
      ...(part ? { part } : {}),
    };
  }
  fail("LESSON_PLAN_REFERENCE", `${path}.source`, "unsupported reference source");
}

function validatePlacement(value: unknown, path: string): LessonPlanPlacement {
  const placement = record(value, path);
  allowedKeys(placement, ["relation", "reference", "align", "gap"], path);
  const relation = placement.relation;
  const relations = new Set(["new_region", "below", "above", "left_of", "right_of", "near", "inside", "overlay"]);
  if (typeof relation !== "string" || !relations.has(relation)) fail("LESSON_PLAN_PLACEMENT", `${path}.relation`, "unsupported placement relation");
  const reference = placement.reference === undefined ? undefined : validateReference(placement.reference, `${path}.reference`);
  if (relation === "new_region" && reference) fail("LESSON_PLAN_PLACEMENT", `${path}.reference`, "new_region cannot have a reference");
  if (relation !== "new_region" && !reference) fail("LESSON_PLAN_PLACEMENT", `${path}.reference`, "relative placement requires a reference");
  if (placement.align !== undefined && !["start", "center", "end"].includes(String(placement.align))) fail("LESSON_PLAN_PLACEMENT", `${path}.align`, "unsupported alignment");
  if (placement.gap !== undefined && !["tight", "normal", "wide"].includes(String(placement.gap))) fail("LESSON_PLAN_PLACEMENT", `${path}.gap`, "unsupported gap");
  return placement as unknown as LessonPlanPlacement;
}

function validateBoardContent(kind: LessonPlanBoardKind, value: unknown, path: string, numberCount: number, resourceCount: number): LessonPlanBoardContent {
  const content = record(value, path);
  if (kind === "text" || kind === "shape") {
    allowedKeys(content, ["text"], path);
    nonEmptyString(content.text, `${path}.text`);
  } else if (kind === "math") {
    allowedKeys(content, ["latex"], path);
    nonEmptyString(content.latex, `${path}.latex`);
  } else if (kind === "note") {
    allowedKeys(content, ["title", "items"], path);
    nonEmptyString(content.title, `${path}.title`, 240);
    const items = array(content.items, `${path}.items`);
    if (items.length === 0) fail("LESSON_PLAN_CONTENT", `${path}.items`, "note requires at least one item");
    items.forEach((item, index) => nonEmptyString(item, `${path}.items[${index}]`));
  } else if (kind === "table") {
    allowedKeys(content, ["columns", "rows"], path);
    const columns = array(content.columns, `${path}.columns`);
    if (columns.length === 0) fail("LESSON_PLAN_CONTENT", `${path}.columns`, "table requires columns");
    columns.forEach((item, index) => nonEmptyString(item, `${path}.columns[${index}]`));
    const rows = array(content.rows, `${path}.rows`);
    rows.forEach((row, rowIndex) => {
      const cells = array(row, `${path}.rows[${rowIndex}]`);
      if (cells.length !== columns.length) fail("LESSON_PLAN_CONTENT", `${path}.rows[${rowIndex}]`, "row width must equal column count");
      cells.forEach((cell, columnIndex) => {
        if (typeof cell === "number") finiteNumber(cell, `${path}.rows[${rowIndex}][${columnIndex}]`);
        else nonEmptyString(cell, `${path}.rows[${rowIndex}][${columnIndex}]`);
      });
    });
  } else if (kind === "image") {
    allowedKeys(content, ["resource", "alt"], path);
    const index = positiveIndex(content.resource, `${path}.resource`);
    if (index > resourceCount) fail("LESSON_PLAN_IMAGE_RESOURCE", `${path}.resource`, "image resource is unavailable");
    optionalString(content.alt, `${path}.alt`, 480);
  } else {
    allowedKeys(content, ["capability", "parameters", "numbers"], path);
    const visualCapability = capability(content.capability, `${path}.capability`);
    if (content.parameters !== undefined) {
      validateParameters(content.parameters, `${path}.parameters`);
      if (visualCapability === "function_plot") {
        const visualParameters = record(content.parameters, `${path}.parameters`);
        const expressionFields = ["expression", "expressions", "expression_tokens"]
          .filter((field) => visualParameters[field] !== undefined);
        if (expressionFields.length !== 1) {
          fail(
            "LESSON_PLAN_EXPRESSION",
            `${path}.parameters`,
            "a function plot requires exactly one explicit mathematical expression",
          );
        }
        if (visualParameters.expression_tokens !== undefined) {
          const expressionTokens = array(
            visualParameters.expression_tokens,
            `${path}.parameters.expression_tokens`,
          );
          if (!expressionTokens.some((token) => (
            token !== null
            && typeof token === "object"
            && !Array.isArray(token)
            && (token as Record<string, unknown>).kind === "input"
          ))) {
            fail(
              "LESSON_PLAN_PLOT_INPUT",
              `${path}.parameters.expression_tokens`,
              "a parameterized function curve must explicitly depend on the plot input; a lesson number cannot replace the horizontal-axis input",
            );
          }
          validateMathExpression(
            visualParameters.expression_tokens,
            `${path}.parameters.expression_tokens`,
            numberCount,
            true,
          );
        }
      }
    } else if (visualCapability === "function_plot") {
      fail(
        "LESSON_PLAN_EXPRESSION",
        `${path}.parameters`,
        "a function plot requires an explicit mathematical expression",
      );
    }
    if (content.numbers !== undefined) {
      const numbers = array(content.numbers, `${path}.numbers`);
      if (numbers.length > 16) fail("LESSON_PLAN_CONTENT", `${path}.numbers`, "too many number references");
      numbers.forEach((item, index) => {
        const number = positiveIndex(item, `${path}.numbers[${index}]`);
        if (number > numberCount) fail("LESSON_PLAN_NUMBER_REFERENCE", `${path}.numbers[${index}]`, "number reference is unavailable");
      });
      if (visualCapability === "function_plot"
        && numbers.length > 1) {
        const visualParameters = record(content.parameters ?? {}, `${path}.parameters`);
        const hasCurveExpression = visualParameters.expression_tokens !== undefined;
        if (!hasCurveExpression) {
          fail(
            "LESSON_PLAN_EXPRESSION",
            `${path}.parameters.expression_tokens`,
            "a function plot with multiple numeric inputs must define how those inputs change the whole curve",
          );
        }
      }
    }
  }
  return content as LessonPlanBoardContent;
}

interface TargetRecord {
  id: string;
  authoringAlias: string;
  kind: LessonPlanReusableKind | "host";
  boardKind?: LessonPlanBoardKind;
  capability?: LessonPlanCapability;
  hostParts?: Set<string>;
}

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function localKey(section: number, moment: number, kind: LessonPlanReusableKind, item: number): string {
  return `${section}:${moment}:${kind}:${item}`;
}

function reusableKey(section: number, item: number): string {
  return `${section}:${item}`;
}

function assertPart(target: TargetRecord, part: LessonPlanPartReference | undefined, path: string): void {
  if (!part) return;
  if (part.kind === "capability") {
    if (!target.capability) fail("LESSON_PLAN_PART", path, "capability part requires a visual capability target");
    const roles: readonly string[] = LESSON_PLAN_CAPABILITIES[target.capability];
    if (!roles.includes(part.role)) fail("LESSON_PLAN_PART", path, `capability '${target.capability}' has no part '${part.role}'`);
  } else if (part.kind === "index") {
    if (!target.hostParts) fail("LESSON_PLAN_PART", path, "index parts are only available on host nodes");
    if (part.index > target.hostParts.size) fail("LESSON_PLAN_PART", path, "host part is unavailable");
  }
}

function validateLessonPlanNumbers(value: unknown, path: string): unknown[] {
  const numbers = value === undefined ? [] : array(value, path);
  if (numbers.length > 16) fail("LESSON_PLAN_NUMBERS", path, "expected at most 16 numeric states");
  numbers.forEach((entry, index) => {
    const numberPath = `${path}[${index}]`;
    const number = record(entry, numberPath);
    allowedKeys(number, ["initial", "min", "max", "label", "unit", "student_control"], numberPath);
    const initial = finiteNumber(number.initial, `${numberPath}.initial`);
    const min = finiteNumber(number.min, `${numberPath}.min`);
    const max = finiteNumber(number.max, `${numberPath}.max`);
    if (!(min < max && initial >= min && initial <= max)) {
      fail("LESSON_PLAN_NUMBER_RANGE", numberPath, "expected min < max and initial inside the range");
    }
    optionalString(number.label, `${numberPath}.label`, 80);
    optionalString(number.unit, `${numberPath}.unit`, 32);
    if (number.student_control === undefined) return;
    const controlPath = `${numberPath}.student_control`;
    const control = record(number.student_control, controlPath);
    allowedKeys(control, ["kind", "step"], controlPath);
    if (control.kind !== "slider") fail("LESSON_PLAN_CONTROL", `${controlPath}.kind`, "only slider is supported");
    if (control.step === undefined) return;
    const step = finiteNumber(control.step, `${controlPath}.step`);
    if (step <= 0 || step > max - min) {
      fail("LESSON_PLAN_CONTROL", `${controlPath}.step`, "step must be positive and inside the range");
    }
    if ((max - min) / step > 1_000) {
      fail(
        "LESSON_PLAN_CONTROL_RESOLUTION",
        `${controlPath}.step`,
        "a slider cannot expose more than 1000 distinct intervals; use a coarser step or a smaller range",
      );
    }
  });
  return numbers;
}

export function resolveLessonPlan(value: unknown, options: ResolveLessonPlanOptions = {}): ResolvedLessonPlan {
  const root = record(value, "$lessonPlan");
  allowedKeys(root, ["version", "title", "goals", "teaching_strategies", "numbers", "sections", "close"], "$lessonPlan");
  if (root.version !== LESSON_PLAN_VERSION) fail("LESSON_PLAN_VERSION", "$lessonPlan.version", `expected '${LESSON_PLAN_VERSION}'`);
  nonEmptyString(root.title, "$lessonPlan.title", 160);
  const goals = array(root.goals, "$lessonPlan.goals");
  if (goals.length < 1 || goals.length > 8) fail("LESSON_PLAN_GOALS", "$lessonPlan.goals", "expected 1 to 8 goals");
  goals.forEach((goal, index) => nonEmptyString(goal, `$lessonPlan.goals[${index}]`, 480));
  if (root.teaching_strategies !== undefined) {
    const strategies = array(root.teaching_strategies, "$lessonPlan.teaching_strategies");
    if (strategies.length > 16) fail("LESSON_PLAN_STRATEGIES", "$lessonPlan.teaching_strategies", "expected at most 16 strategies");
    strategies.forEach((strategy, index) => nonEmptyString(strategy, `$lessonPlan.teaching_strategies[${index}]`, 240));
  }

  const rawNumbers = validateLessonPlanNumbers(root.numbers, "$lessonPlan.numbers");

  const hostReferences = options.host_references ?? [];
  const imageResources = options.image_resources ?? [];
  imageResources.forEach((resource, index) => {
    nonEmptyString(resource.asset_id, `$options.image_resources[${index}].asset_id`);
  });
  const hosts = new Map<number, TargetRecord>();
  hostReferences.forEach((host, index) => {
    nonEmptyString(host.target_id, `$options.host_references[${index}].target_id`);
    if (!["node", "connection", "group"].includes(host.type)) {
      fail("LESSON_PLAN_HOST_REFERENCE", `$options.host_references[${index}].type`, "unsupported host reference type");
    }
    optionalString(host.label, `$options.host_references[${index}].label`, 160);
    if (host.type !== "node" && (host.parts?.length ?? 0) > 0) {
      fail("LESSON_PLAN_HOST_REFERENCE", `$options.host_references[${index}].parts`, "only host nodes can expose parts");
    }
    hosts.set(index + 1, {
      id: host.target_id,
      authoringAlias: `host-${pad(index + 1)}`,
      kind: "host",
      hostParts: new Set(host.parts ?? []),
    });
  });

  const rawSections = array(root.sections, "$lessonPlan.sections");
  if (rawSections.length < 1 || rawSections.length > 24) fail("LESSON_PLAN_SECTIONS", "$lessonPlan.sections", "expected 1 to 24 sections");
  const locals = new Map<string, TargetRecord>();
  const reusables = new Map<string, TargetRecord>();
  const references: ResolvedLessonPlanReference[] = [];
  const visuallyBoundNumbers = new Set<number>();
  const requiredVisualNumberUses: Array<{ number: number; path: string }> = [];
  const resolvedSections: ResolvedLessonPlan["sections"] = [];

  const resolveReference = (raw: unknown, path: string, sectionIndex: number, momentIndex: number): TargetRecord => {
    const ref = validateReference(raw, path);
    let target: TargetRecord | undefined;
    if (ref.source === "host") {
      target = hosts.get(ref.reference);
      if (!target) fail("LESSON_PLAN_HOST_REFERENCE", path, "host reference is unavailable");
    } else if (ref.source === "reusable") {
      if (ref.section > sectionIndex) fail("LESSON_PLAN_REFERENCE_ORDER", path, "reusable references cannot point to a future section");
      target = reusables.get(reusableKey(ref.section, ref.item));
      if (!target) fail("LESSON_PLAN_REFERENCE", path, "reusable item has not been filled");
    } else {
      if (ref.moment > momentIndex) fail("LESSON_PLAN_REFERENCE_ORDER", path, "local references cannot point to a future moment");
      const kind: LessonPlanReusableKind = ref.source === "local_board_item"
        ? "board_item"
        : ref.source === "local_connection" ? "connection" : "group";
      target = locals.get(localKey(sectionIndex, ref.moment, kind, ref.item));
      if (!target) fail("LESSON_PLAN_REFERENCE", path, "local item does not exist");
    }
    assertPart(target, ref.part, `${path}.part`);
    references.push({
      path,
      target_id: target.id,
      authoring_alias: target.authoringAlias,
      target_kind: target.kind,
      ...(target.boardKind ? { board_kind: target.boardKind } : {}),
      ...(target.capability ? { capability: target.capability } : {}),
      ...(ref.part ? { part: ref.part } : {}),
    });
    return target;
  };

  rawSections.forEach((rawSection, sectionOffset) => {
    const sectionIndex = sectionOffset + 1;
    const path = `$lessonPlan.sections[${sectionOffset}]`;
    const section = record(rawSection, path);
    allowedKeys(section, ["purpose", "reusable_items", "moments", "student_activities"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const reusableDeclarations = section.reusable_items === undefined
      ? [] : array(section.reusable_items, `${path}.reusable_items`);
    if (reusableDeclarations.length > 32) fail("LESSON_PLAN_REUSABLE", `${path}.reusable_items`, "expected at most 32 reusable items");
    const declarations = reusableDeclarations.map((entry, declarationOffset) => {
      const declarationPath = `${path}.reusable_items[${declarationOffset}]`;
      const declaration = record(entry, declarationPath);
      allowedKeys(declaration, ["kind", "board_kind", "capability"], declarationPath);
      if (!["board_item", "connection", "group"].includes(String(declaration.kind))) fail("LESSON_PLAN_REUSABLE", `${declarationPath}.kind`, "unsupported reusable item kind");
      if (declaration.kind === "board_item") {
        if (typeof declaration.board_kind !== "string" || !boardKinds.has(declaration.board_kind as LessonPlanBoardKind)) fail("LESSON_PLAN_REUSABLE", `${declarationPath}.board_kind`, "board_item requires a supported board_kind");
        if (declaration.board_kind === "visual") capability(declaration.capability, `${declarationPath}.capability`);
        else if (declaration.capability !== undefined) fail("LESSON_PLAN_REUSABLE", `${declarationPath}.capability`, "only visual board items declare a capability");
      } else if (declaration.board_kind !== undefined || declaration.capability !== undefined) {
        fail("LESSON_PLAN_REUSABLE", declarationPath, "connection and group declarations do not use board_kind or capability");
      }
      return declaration as unknown as LessonPlanReusableItem;
    });
    const assigned = new Map<number, TargetRecord>();
    const assignReusable = (slotValue: unknown, target: TargetRecord, assignmentPath: string): void => {
      if (slotValue === undefined) return;
      const slot = positiveIndex(slotValue, assignmentPath);
      const declaration = declarations[slot - 1];
      if (!declaration) fail("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot is not declared");
      if (assigned.has(slot)) fail("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot is filled more than once");
      if (declaration.kind !== target.kind) fail("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot kind does not match the created item");
      if (target.kind === "board_item") {
        if (declaration.board_kind !== target.boardKind) fail("LESSON_PLAN_REUSABLE", assignmentPath, "reusable board kind does not match");
        if (declaration.capability !== target.capability) fail("LESSON_PLAN_REUSABLE", assignmentPath, "reusable capability does not match");
      }
      assigned.set(slot, target);
    };

    const rawMoments = array(section.moments, `${path}.moments`);
    if (rawMoments.length < 1 || rawMoments.length > 12) fail("LESSON_PLAN_MOMENTS", `${path}.moments`, "expected 1 to 12 moments");
    const resolvedMoments: ResolvedLessonPlan["sections"][number]["moments"] = [];
    rawMoments.forEach((rawMoment, momentOffset) => {
      const momentIndex = momentOffset + 1;
      const momentPath = `${path}.moments[${momentOffset}]`;
      const moment = record(rawMoment, momentPath);
      allowedKeys(moment, ["narration", "delivery", "actions"], momentPath);
      optionalString(moment.narration, `${momentPath}.narration`);
      if (moment.delivery !== undefined && (typeof moment.delivery !== "string" || !deliveries.has(moment.delivery as LessonPlanDelivery))) fail("LESSON_PLAN_DELIVERY", `${momentPath}.delivery`, "unsupported delivery");
      const actions = array(moment.actions, `${momentPath}.actions`);
      if (actions.length > 48) fail("LESSON_PLAN_ACTIONS", `${momentPath}.actions`, "expected at most 48 ordered actions");
      const boardItemIds: string[] = [];
      const connectionIds: string[] = [];
      const groupIds: string[] = [];
      let boardItemIndex = 0;
      let connectionIndex = 0;
      let groupIndex = 0;
      actions.forEach((entry, actionOffset) => {
        const itemPath = `${momentPath}.actions[${actionOffset}]`;
        const action = record(entry, itemPath);
        const actionKind = action.action;
        if (actionKind === "create") {
          allowedKeys(action, ["action", "kind", "role", "content", "timing", "placement", "reusable_item", "distinct_visual"], itemPath);
          if (typeof action.kind !== "string" || !boardKinds.has(action.kind as LessonPlanBoardKind)) fail("LESSON_PLAN_BOARD_KIND", `${itemPath}.kind`, "unsupported board item kind");
          const kind = action.kind as LessonPlanBoardKind;
          nonEmptyString(action.role, `${itemPath}.role`, 80);
          optionalTiming(action.timing, `${itemPath}.timing`);
          const placement = validatePlacement(action.placement, `${itemPath}.placement`);
          if (placement.reference) resolveReference(placement.reference, `${itemPath}.placement.reference`, sectionIndex, momentIndex);
          const content = validateBoardContent(kind, action.content, `${itemPath}.content`, rawNumbers.length, imageResources.length);
          if (action.distinct_visual !== undefined) {
            if (kind !== "visual" || typeof action.distinct_visual !== "boolean") {
              fail("LESSON_PLAN_COURSE_VISUAL", `${itemPath}.distinct_visual`, "distinct_visual is only valid on visual creates");
            }
          }
          if (kind === "visual") {
            const visualContent = content as LessonPlanVisualContent;
            if (visualContent.capability === "function_plot"
              && visualContent.parameters?.expression_tokens !== undefined) {
              const curveNumbers = validateMathExpression(
                visualContent.parameters.expression_tokens,
                `${itemPath}.content.parameters.expression_tokens`,
                rawNumbers.length,
                true,
              );
              for (const number of curveNumbers) visuallyBoundNumbers.add(number);
              if (curveNumbers.length === 0) {
                const movingPointNumber = visualContent.numbers?.[0];
                if (movingPointNumber !== undefined) visuallyBoundNumbers.add(movingPointNumber);
              }
            } else if (visualContent.capability === "function_plot") {
              const movingPointNumber = visualContent.numbers?.[0];
              if (movingPointNumber !== undefined) visuallyBoundNumbers.add(movingPointNumber);
            } else {
              for (const number of visualContent.numbers ?? []) visuallyBoundNumbers.add(number);
            }
          }
          boardItemIndex += 1;
          const id = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-item-${pad(boardItemIndex)}`;
          const target: TargetRecord = { id, authoringAlias: id, kind: "board_item", boardKind: kind };
          if (kind === "visual") target.capability = (content as LessonPlanVisualContent).capability;
          locals.set(localKey(sectionIndex, momentIndex, "board_item", boardItemIndex), target);
          boardItemIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "revise") {
          allowedKeys(action, ["action", "reference", "kind", "content", "reason", "timing"], itemPath);
          const target = resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          if (typeof action.kind !== "string" || !boardKinds.has(action.kind as LessonPlanBoardKind)) fail("LESSON_PLAN_BOARD_KIND", `${itemPath}.kind`, "unsupported revision board kind");
          const revisionKind = action.kind as LessonPlanBoardKind;
          if (target.kind !== "board_item" || !target.boardKind) fail("LESSON_PLAN_ACTION_TARGET", `${itemPath}.reference`, "revise requires a board item created by this lesson; host board references are read-only");
          if (target.boardKind !== revisionKind) fail("LESSON_PLAN_ACTION_TARGET", `${itemPath}.kind`, "revision kind must match the board item");
          validateBoardContent(revisionKind, action.content, `${itemPath}.content`, rawNumbers.length, imageResources.length);
          nonEmptyString(action.reason, `${itemPath}.reason`, 480);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "emphasize") {
          allowedKeys(action, ["action", "reference", "emphasis", "timing"], itemPath);
          resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          if (typeof action.emphasis !== "string" || !emphasisValues.has(action.emphasis as LessonPlanEmphasis)) fail("LESSON_PLAN_EMPHASIS", `${itemPath}.emphasis`, "unsupported emphasis");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "connect") {
          allowedKeys(action, ["action", "from_ref", "to_ref", "relation", "label", "timing", "reusable_item"], itemPath);
          resolveReference(action.from_ref, `${itemPath}.from_ref`, sectionIndex, momentIndex);
          resolveReference(action.to_ref, `${itemPath}.to_ref`, sectionIndex, momentIndex);
          nonEmptyString(action.relation, `${itemPath}.relation`, 80);
          optionalString(action.label, `${itemPath}.label`, 160);
          optionalTiming(action.timing, `${itemPath}.timing`);
          connectionIndex += 1;
          const id = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-connection-${pad(connectionIndex)}`;
          const target: TargetRecord = { id, authoringAlias: id, kind: "connection" };
          locals.set(localKey(sectionIndex, momentIndex, "connection", connectionIndex), target);
          connectionIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "group") {
          allowedKeys(action, ["action", "role", "label", "members", "timing", "reusable_item"], itemPath);
          nonEmptyString(action.role, `${itemPath}.role`, 80);
          nonEmptyString(action.label, `${itemPath}.label`, 160);
          const members = array(action.members, `${itemPath}.members`);
          if (members.length === 0) fail("LESSON_PLAN_GROUP", `${itemPath}.members`, "group requires members");
          members.forEach((member, index) => resolveReference(member, `${itemPath}.members[${index}]`, sectionIndex, momentIndex));
          optionalTiming(action.timing, `${itemPath}.timing`);
          groupIndex += 1;
          const id = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-group-${pad(groupIndex)}`;
          const target: TargetRecord = { id, authoringAlias: id, kind: "group" };
          locals.set(localKey(sectionIndex, momentIndex, "group", groupIndex), target);
          groupIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "focus") {
          allowedKeys(action, ["action", "references", "intent", "timing"], itemPath);
          const refs = array(action.references, `${itemPath}.references`);
          if (refs.length === 0) fail("LESSON_PLAN_FOCUS", `${itemPath}.references`, "focus requires references");
          refs.forEach((ref, index) => resolveReference(ref, `${itemPath}.references[${index}]`, sectionIndex, momentIndex));
          nonEmptyString(action.intent, `${itemPath}.intent`, 160);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "point_at") {
          allowedKeys(action, ["action", "reference", "timing"], itemPath);
          resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "teacher_expression") {
          allowedKeys(action, ["action", "expression", "timing"], itemPath);
          if (typeof action.expression !== "string" || !teacherExpressions.has(action.expression as LessonPlanTeacherExpression)) fail("LESSON_PLAN_EXPRESSION", `${itemPath}.expression`, "unsupported teacher expression");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "animate") {
          allowedKeys(action, ["action", "number", "end_value", "easing", "duration_intent", "timing"], itemPath);
          const number = positiveIndex(action.number, `${itemPath}.number`);
          requiredVisualNumberUses.push({ number, path: `${itemPath}.number` });
          if (number > rawNumbers.length) fail("LESSON_PLAN_NUMBER_REFERENCE", `${itemPath}.number`, "number reference is unavailable");
          const end = finiteNumber(action.end_value, `${itemPath}.end_value`);
          const definition = record(rawNumbers[number - 1], `$lessonPlan.numbers[${number - 1}]`);
          if (end < Number(definition.min) || end > Number(definition.max)) fail("LESSON_PLAN_ANIMATION", `${itemPath}.end_value`, "animation end is outside the number range");
          if (action.easing !== undefined && !["linear", "ease_in_out"].includes(String(action.easing))) fail("LESSON_PLAN_ANIMATION", `${itemPath}.easing`, "unsupported easing");
          if (action.duration_intent !== undefined && !["brief", "normal", "extended"].includes(String(action.duration_intent))) fail("LESSON_PLAN_ANIMATION", `${itemPath}.duration_intent`, "unsupported duration intent");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else {
          fail("LESSON_PLAN_ACTION", `${itemPath}.action`, "unsupported action");
        }
      });

      resolvedMoments.push({
        index: momentIndex,
        moment_id: `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}`,
        board_item_ids: boardItemIds,
        connection_ids: connectionIds,
        group_ids: groupIds,
      });
    });

    const resolvedReusable = declarations.map((declaration, declarationOffset) => {
      const slot = declarationOffset + 1;
      const target = assigned.get(slot);
      if (!target) fail("LESSON_PLAN_REUSABLE_UNFILLED", `${path}.reusable_items[${declarationOffset}]`, "declared reusable item was not created");
      reusables.set(reusableKey(sectionIndex, slot), target);
      return { index: slot, target_id: target.id, target_kind: declaration.kind };
    });

    const activities = section.student_activities === undefined
      ? [] : array(section.student_activities, `${path}.student_activities`);
    activities.forEach((entry, index) => {
      const activityPath = `${path}.student_activities[${index}]`;
      const activity = record(entry, activityPath);
      if (activity.kind === "number_target") {
        allowedKeys(activity, [
          "kind", "prompt", "number_controls", "expression", "value", "tolerance",
          "hints", "hint_after_attempts", "success_message",
        ], activityPath);
        const numberControls = array(activity.number_controls, `${activityPath}.number_controls`);
        if (numberControls.length === 0) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires at least one controllable number");
        const seenNumbers = new Set<number>();
        numberControls.forEach((entry, controlIndex) => {
          const controlPath = `${activityPath}.number_controls[${controlIndex}]`;
          const control = record(entry, controlPath);
          allowedKeys(control, ["number", "controls"], controlPath);
          const number = positiveIndex(control.number, `${controlPath}.number`);
          requiredVisualNumberUses.push({ number, path: `${controlPath}.number` });
          if (number > rawNumbers.length) fail("LESSON_PLAN_NUMBER_REFERENCE", `${controlPath}.number`, "number reference is unavailable");
          if (seenNumbers.has(number)) fail("LESSON_PLAN_ACTIVITY", `${controlPath}.number`, "each number may appear only once in a task");
          seenNumbers.add(number);
          const controls = array(control.controls, `${controlPath}.controls`);
          if (controls.length === 0 || controls.some((item) => !["slider", "geometry_point"].includes(String(item)))) fail("LESSON_PLAN_ACTIVITY", `${controlPath}.controls`, "unsupported number controls");
        });
        if (activity.expression !== undefined) validateMathExpression(activity.expression, `${activityPath}.expression`, rawNumbers.length);
        else if (numberControls.length !== 1) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.expression`, "tasks with multiple numbers require an explicit expression");
        finiteNumber(activity.value, `${activityPath}.value`);
        if (finiteNumber(activity.tolerance, `${activityPath}.tolerance`) <= 0) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.tolerance`, "tolerance must be positive");
      } else if (activity.kind === "scene3d_view") {
        allowedKeys(activity, [
          "kind", "reference", "prompt", "controls", "match", "yaw", "pitch", "zoom",
          "angular_tolerance", "zoom_tolerance", "hints", "hint_after_attempts", "success_message",
        ], activityPath);
        const target = resolveReference(activity.reference, `${activityPath}.reference`, sectionIndex, rawMoments.length);
        if (target.kind !== "board_item"
          || target.boardKind !== "visual"
          || !target.capability
          || !LESSON_PLAN_CAPABILITY_REGISTRY[target.capability].output_kinds.includes("scene3d" as never)) {
          fail("LESSON_PLAN_ACTIVITY", `${activityPath}.reference`, "scene3d_view requires a 3D visual target");
        }
        const controls = array(activity.controls, `${activityPath}.controls`);
        if (controls.length === 0 || controls.some((item) => !["orbit", "zoom", "preset", "reset"].includes(String(item)))) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.controls`, "unsupported scene controls");
        if (!['view_direction', 'camera_pose'].includes(String(activity.match))) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.match`, "unsupported 3D match mode");
        finiteNumber(activity.yaw, `${activityPath}.yaw`);
        const pitch = finiteNumber(activity.pitch, `${activityPath}.pitch`);
        if (pitch < -Math.PI / 2 || pitch > Math.PI / 2) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.pitch`, "pitch is outside the supported range");
        const zoom = finiteNumber(activity.zoom, `${activityPath}.zoom`);
        if (zoom < 0.2 || zoom > 5) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.zoom`, "zoom is outside the supported range");
        if (finiteNumber(activity.angular_tolerance, `${activityPath}.angular_tolerance`) <= 0) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.angular_tolerance`, "angular tolerance must be positive");
        if (finiteNumber(activity.zoom_tolerance, `${activityPath}.zoom_tolerance`) <= 0) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.zoom_tolerance`, "zoom tolerance must be positive");
      } else {
        fail("LESSON_PLAN_ACTIVITY", `${activityPath}.kind`, "unsupported student activity");
      }
      nonEmptyString(activity.prompt, `${activityPath}.prompt`, 480);
      const hints = array(activity.hints, `${activityPath}.hints`);
      if (hints.length === 0) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.hints`, "activity requires hints");
      hints.forEach((hint, hintIndex) => nonEmptyString(hint, `${activityPath}.hints[${hintIndex}]`, 480));
      if (activity.hint_after_attempts !== undefined) positiveIndex(activity.hint_after_attempts, `${activityPath}.hint_after_attempts`);
      optionalString(activity.success_message, `${activityPath}.success_message`, 480);
    });

    resolvedSections.push({
      index: sectionIndex,
      section_id: `section-${pad(sectionIndex)}`,
      moments: resolvedMoments,
      reusable_items: resolvedReusable,
    });
  });

  const close = record(root.close, "$lessonPlan.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlan.close");
  nonEmptyString(close.summary, "$lessonPlan.close.summary", 1_200);
  const closeFocus = array(close.focus, "$lessonPlan.close.focus");
  if (closeFocus.length === 0) fail("LESSON_PLAN_CLOSE", "$lessonPlan.close.focus", "close requires focus references");
  closeFocus.forEach((ref, index) => resolveReference(ref, `$lessonPlan.close.focus[${index}]`, rawSections.length + 1, 0));

  for (const use of requiredVisualNumberUses) {
    if (!visuallyBoundNumbers.has(use.number)) {
      fail(
        "LESSON_PLAN_UNBOUND_NUMBER",
        use.path,
        `number ${use.number} is animated or assigned to a student task but does not drive any visual`,
      );
    }
  }

  return {
    plan: structuredClone(value) as LessonPlan,
    numbers: rawNumbers.map((_entry, index) => ({ index: index + 1, variable_id: `number_${pad(index + 1)}` })),
    sections: resolvedSections,
    references,
  };
}

export function validateLessonPlan(value: unknown, options: ResolveLessonPlanOptions = {}): LessonPlan {
  return resolveLessonPlan(value, options).plan;
}

export function validateLessonPlanOutline(value: unknown, expectedRequestParts = 0): LessonPlanOutline {
  const outline = record(value, "$lessonPlanOutline");
  allowedKeys(outline, ["version", "title", "goals", "teaching_strategies", "numbers", "request_coverage", "course_visuals", "sections", "close"], "$lessonPlanOutline");
  if (expectedRequestParts > 0 && outline.course_visuals === undefined) {
    fail(
      "LESSON_PLAN_COURSE_VISUAL",
      "$lessonPlanOutline.course_visuals",
      "a model-authored outline must explicitly declare its course visuals, or an empty list for a text-only course",
    );
  }
  if (outline.version !== LESSON_PLAN_VERSION) {
    fail("LESSON_PLAN_VERSION", "$lessonPlanOutline.version", `expected '${LESSON_PLAN_VERSION}'`);
  }
  nonEmptyString(outline.title, "$lessonPlanOutline.title", 160);
  const goals = array(outline.goals, "$lessonPlanOutline.goals");
  if (goals.length < 1 || goals.length > 8) fail("LESSON_PLAN_GOALS", "$lessonPlanOutline.goals", "expected 1 to 8 goals");
  goals.forEach((goal, index) => nonEmptyString(goal, `$lessonPlanOutline.goals[${index}]`, 480));
  if (outline.teaching_strategies !== undefined) {
    const strategies = array(outline.teaching_strategies, "$lessonPlanOutline.teaching_strategies");
    if (strategies.length > 16) fail("LESSON_PLAN_STRATEGIES", "$lessonPlanOutline.teaching_strategies", "expected at most 16 strategies");
    strategies.forEach((strategy, index) => nonEmptyString(strategy, `$lessonPlanOutline.teaching_strategies[${index}]`, 240));
  }
  const numbers = validateLessonPlanNumbers(outline.numbers, "$lessonPlanOutline.numbers");

  const sections = array(outline.sections, "$lessonPlanOutline.sections");
  if (sections.length < 1 || sections.length > 24) fail("LESSON_PLAN_SECTIONS", "$lessonPlanOutline.sections", "expected 1 to 24 sections");
  const declarationsBySection: LessonPlanReusableItem[][] = [];
  sections.forEach((entry, index) => {
    const path = `$lessonPlanOutline.sections[${index}]`;
    const section = record(entry, path);
    allowedKeys(section, ["purpose", "allowed_capabilities", "reusable_items"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const allowedCapabilities = array(section.allowed_capabilities, `${path}.allowed_capabilities`);
    const seenCapabilities = new Set<LessonPlanCapability>();
    allowedCapabilities.forEach((item, capabilityIndex) => {
      const value = capability(item, `${path}.allowed_capabilities[${capabilityIndex}]`);
      if (seenCapabilities.has(value)) fail("LESSON_PLAN_CAPABILITY", `${path}.allowed_capabilities[${capabilityIndex}]`, "capability is duplicated");
      seenCapabilities.add(value);
    });
    const declarations = section.reusable_items === undefined ? [] : array(section.reusable_items, `${path}.reusable_items`);
    if (declarations.length > 32) fail("LESSON_PLAN_REUSABLE", `${path}.reusable_items`, "expected at most 32 reusable items");
    declarationsBySection.push(declarations.map((declarationValue, declarationIndex) => {
      const declarationPath = `${path}.reusable_items[${declarationIndex}]`;
      const declaration = record(declarationValue, declarationPath);
      allowedKeys(declaration, ["kind", "board_kind", "capability"], declarationPath);
      if (!['board_item', 'connection', 'group'].includes(String(declaration.kind))) fail("LESSON_PLAN_REUSABLE", `${declarationPath}.kind`, "unsupported reusable item kind");
      if (declaration.kind === "board_item") {
        if (typeof declaration.board_kind !== "string" || !boardKinds.has(declaration.board_kind as LessonPlanBoardKind)) fail("LESSON_PLAN_REUSABLE", `${declarationPath}.board_kind`, "board_item requires a supported board_kind");
        if (declaration.board_kind === "visual") {
          const declaredCapability = capability(declaration.capability, `${declarationPath}.capability`);
          if (!seenCapabilities.has(declaredCapability)) fail("LESSON_PLAN_CAPABILITY", `${declarationPath}.capability`, "reusable capability is not allowed for this section");
        } else if (declaration.capability !== undefined) {
          fail("LESSON_PLAN_REUSABLE", `${declarationPath}.capability`, "only visual board items declare a capability");
        }
      } else if (declaration.board_kind !== undefined || declaration.capability !== undefined) {
        fail("LESSON_PLAN_REUSABLE", declarationPath, "connection and group declarations do not use board_kind or capability");
      }
      return declaration as unknown as LessonPlanReusableItem;
    }));
  });

  const courseVisuals = outline.course_visuals === undefined
    ? [] : array(outline.course_visuals, "$lessonPlanOutline.course_visuals");
  if (courseVisuals.length > 32) {
    fail("LESSON_PLAN_COURSE_VISUAL", "$lessonPlanOutline.course_visuals", "expected at most 32 course visuals");
  }
  const firstVisualByCapability = new Map<LessonPlanCapability, number>();
  courseVisuals.forEach((entry, index) => {
    const path = `$lessonPlanOutline.course_visuals[${index}]`;
    const visual = record(entry, path);
    allowedKeys(visual, ["capability", "create_section", "use_sections", "relation", "related_visual", "reusable_item"], path);
    const visualCapability = capability(visual.capability, `${path}.capability`);
    const createSection = positiveIndex(visual.create_section, `${path}.create_section`);
    if (createSection > sections.length) fail("LESSON_PLAN_COURSE_VISUAL", `${path}.create_section`, "creation section is unavailable");
    const reusableItem = positiveIndex(visual.reusable_item, `${path}.reusable_item`);
    const declaration = declarationsBySection[createSection - 1]?.[reusableItem - 1];
    if (declaration?.kind !== "board_item"
      || declaration.board_kind !== "visual"
      || declaration.capability !== visualCapability) {
      fail("LESSON_PLAN_COURSE_VISUAL", `${path}.reusable_item`, "course visual must map to a matching visual reusable item");
    }
    const uses = array(visual.use_sections, `${path}.use_sections`);
    const seenUses = new Set<number>();
    uses.forEach((sectionValue, useIndex) => {
      const section = positiveIndex(sectionValue, `${path}.use_sections[${useIndex}]`);
      if (section < createSection || section > sections.length) {
        fail("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections[${useIndex}]`, "a visual can only be used from its creation section onward");
      }
      if (seenUses.has(section)) fail("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections[${useIndex}]`, "use section is duplicated");
      seenUses.add(section);
    });
    if (!seenUses.has(createSection)) fail("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections`, "use sections must include the creation section");
    if (!['primary', 'supporting', 'comparison'].includes(String(visual.relation))) {
      fail("LESSON_PLAN_COURSE_VISUAL", `${path}.relation`, "unsupported visual relation");
    }
    const firstPosition = firstVisualByCapability.get(visualCapability);
    if (firstPosition !== undefined && visual.relation !== "comparison") {
      fail(
        "LESSON_PLAN_COURSE_VISUAL",
        path,
        `capability '${visualCapability}' already has course visual ${firstPosition}; reuse it or declare an explicit comparison`,
      );
    }
    if (firstPosition === undefined) firstVisualByCapability.set(visualCapability, index + 1);
    if (visual.related_visual !== undefined) {
      const related = positiveIndex(visual.related_visual, `${path}.related_visual`);
      if (related >= index + 1) {
        fail("LESSON_PLAN_COURSE_VISUAL", `${path}.related_visual`, "a related visual must be an earlier course visual");
      }
    } else if (visual.relation !== "primary") {
      fail("LESSON_PLAN_COURSE_VISUAL", `${path}.related_visual`, "supporting and comparison visuals require a related visual position");
    }
  });

  if (expectedRequestParts > 0 || outline.request_coverage !== undefined) {
    const coverage = array(outline.request_coverage, "$lessonPlanOutline.request_coverage");
    if (expectedRequestParts > 0 && coverage.length !== expectedRequestParts) {
      fail("LESSON_PLAN_REQUEST_COVERAGE", "$lessonPlanOutline.request_coverage", `expected exactly ${expectedRequestParts} request coverage entries`);
    }
    const seen = new Set<number>();
    coverage.forEach((entry, index) => {
      const path = `$lessonPlanOutline.request_coverage[${index}]`;
      const item = record(entry, path);
      allowedKeys(item, ["request_part", "treatment", "sections", "reason"], path);
      const requestPart = positiveIndex(item.request_part, `${path}.request_part`);
      if (expectedRequestParts > 0 && requestPart > expectedRequestParts) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.request_part`, "request part is unavailable");
      if (seen.has(requestPart)) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.request_part`, "request part is duplicated");
      seen.add(requestPart);
      if (item.treatment !== "teach" && item.treatment !== "unsupported") fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.treatment`, "unsupported treatment");
      const coveredSections = array(item.sections, `${path}.sections`);
      const seenSections = new Set<number>();
      coveredSections.forEach((sectionValue, sectionIndex) => {
        const section = positiveIndex(sectionValue, `${path}.sections[${sectionIndex}]`);
        if (section > sections.length) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections[${sectionIndex}]`, "section is unavailable");
        if (seenSections.has(section)) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections[${sectionIndex}]`, "section is duplicated");
        seenSections.add(section);
      });
      if (item.treatment === "teach") {
        if (coveredSections.length === 0) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections`, "a taught request part must map to at least one section");
        if (item.reason !== undefined) nonEmptyString(item.reason, `${path}.reason`, 480);
      } else {
        if (coveredSections.length !== 0) fail("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections`, "an unsupported request part cannot map to a lesson section");
        nonEmptyString(item.reason, `${path}.reason`, 480);
      }
    });
    if (expectedRequestParts > 0) {
      for (let requestPart = 1; requestPart <= expectedRequestParts; requestPart += 1) {
        if (!seen.has(requestPart)) fail("LESSON_PLAN_REQUEST_COVERAGE", "$lessonPlanOutline.request_coverage", `request part ${requestPart} is missing`);
      }
    }
  }

  const close = record(outline.close, "$lessonPlanOutline.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlanOutline.close");
  nonEmptyString(close.summary, "$lessonPlanOutline.close.summary", 1_200);
  const closeFocus = array(close.focus, "$lessonPlanOutline.close.focus");
  if (closeFocus.length === 0) fail("LESSON_PLAN_CLOSE", "$lessonPlanOutline.close.focus", "close requires focus references");
  closeFocus.forEach((value, index) => {
    const path = `$lessonPlanOutline.close.focus[${index}]`;
    const reference = validateReference(value, path);
    if (reference.source !== "reusable" && reference.source !== "host") {
      fail("LESSON_PLAN_OUTLINE_REFERENCE", `${path}.source`, "the outline can only focus a declared reusable item or a host reference");
    }
    if (reference.source === "reusable") {
      if (reference.section > sections.length) fail("LESSON_PLAN_REFERENCE", `${path}.section`, "reusable section is unavailable");
      const declaration = declarationsBySection[reference.section - 1]?.[reference.item - 1];
      if (!declaration) fail("LESSON_PLAN_REFERENCE", `${path}.item`, "reusable item is not declared");
      if (reference.part?.kind === "capability") {
        if (!declaration.capability) fail("LESSON_PLAN_PART", `${path}.part`, "capability part requires a visual reusable item");
        const roles: readonly string[] = LESSON_PLAN_CAPABILITIES[declaration.capability];
        if (!roles.includes(reference.part.role)) fail("LESSON_PLAN_PART", `${path}.part.role`, "capability part is unavailable");
      } else if (reference.part) {
        fail("LESSON_PLAN_PART", `${path}.part`, "index parts are only available on host references");
      }
    }
  });
  return structuredClone(value) as LessonPlanOutline;
}

export function assembleLessonPlan(
  outlineValue: unknown,
  draftValues: unknown,
  options: ResolveLessonPlanOptions = {},
): LessonPlan {
  const outline = record(validateLessonPlanOutline(outlineValue), "$lessonPlanOutline");
  allowedKeys(outline, ["version", "title", "goals", "teaching_strategies", "numbers", "request_coverage", "course_visuals", "sections", "close"], "$lessonPlanOutline");
  if (outline.version !== LESSON_PLAN_VERSION) {
    fail("LESSON_PLAN_VERSION", "$lessonPlanOutline.version", `expected '${LESSON_PLAN_VERSION}'`);
  }
  nonEmptyString(outline.title, "$lessonPlanOutline.title", 160);
  const goals = array(outline.goals, "$lessonPlanOutline.goals");
  const sections = array(outline.sections, "$lessonPlanOutline.sections");
  if (sections.length < 1 || sections.length > 24) {
    fail("LESSON_PLAN_SECTIONS", "$lessonPlanOutline.sections", "expected 1 to 24 sections");
  }
  sections.forEach((entry, index) => {
    const path = `$lessonPlanOutline.sections[${index}]`;
    const section = record(entry, path);
    allowedKeys(section, ["purpose", "allowed_capabilities", "reusable_items"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const allowedCapabilities = array(section.allowed_capabilities, `${path}.allowed_capabilities`);
    const seenCapabilities = new Set<LessonPlanCapability>();
    allowedCapabilities.forEach((item, capabilityIndex) => {
      const value = capability(item, `${path}.allowed_capabilities[${capabilityIndex}]`);
      if (seenCapabilities.has(value)) fail("LESSON_PLAN_CAPABILITY", `${path}.allowed_capabilities[${capabilityIndex}]`, "capability is duplicated");
      seenCapabilities.add(value);
    });
    if (section.reusable_items !== undefined) {
      array(section.reusable_items, `${path}.reusable_items`).forEach((entry, reusableIndex) => {
        const declaration = record(entry, `${path}.reusable_items[${reusableIndex}]`);
        if (declaration.capability !== undefined) {
          const value = capability(declaration.capability, `${path}.reusable_items[${reusableIndex}].capability`);
          if (!seenCapabilities.has(value)) fail("LESSON_PLAN_CAPABILITY", `${path}.reusable_items[${reusableIndex}].capability`, "reusable capability is not allowed for this section");
        }
      });
    }
  });
  const close = record(outline.close, "$lessonPlanOutline.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlanOutline.close");
  nonEmptyString(close.summary, "$lessonPlanOutline.close.summary", 1_200);
  const outlineFocus = array(close.focus, "$lessonPlanOutline.close.focus");
  if (outlineFocus.length === 0) fail("LESSON_PLAN_CLOSE", "$lessonPlanOutline.close.focus", "close requires focus references");
  outlineFocus.forEach((value, index) => {
    const reference = validateReference(value, `$lessonPlanOutline.close.focus[${index}]`);
    if (reference.source !== "reusable" && reference.source !== "host") {
      fail(
        "LESSON_PLAN_OUTLINE_REFERENCE",
        `$lessonPlanOutline.close.focus[${index}].source`,
        "the outline can only focus a declared reusable item or a host reference",
      );
    }
  });

  const drafts = array(draftValues, "$lessonPlanSectionDrafts");
  if (drafts.length !== sections.length) {
    fail("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanSectionDrafts", "expected exactly one draft for every outline section");
  }
  const bySection = new Map<number, Record<string, unknown>>();
  drafts.forEach((entry, index) => {
    const path = `$lessonPlanSectionDrafts[${index}]`;
    const draft = record(entry, path);
    allowedKeys(draft, ["version", "section", "moments", "student_activities"], path);
    if (draft.version !== LESSON_PLAN_VERSION) fail("LESSON_PLAN_VERSION", `${path}.version`, `expected '${LESSON_PLAN_VERSION}'`);
    const section = positiveIndex(draft.section, `${path}.section`);
    if (section > sections.length) fail("LESSON_PLAN_SECTION_DRAFTS", `${path}.section`, "section is outside the outline");
    if (bySection.has(section)) fail("LESSON_PLAN_SECTION_DRAFTS", `${path}.section`, "section draft is duplicated");
    array(draft.moments, `${path}.moments`);
    if (draft.student_activities !== undefined) array(draft.student_activities, `${path}.student_activities`);
    const outlineSection = sections[section - 1] as Record<string, unknown>;
    const allowedCapabilities = new Set(array(outlineSection.allowed_capabilities, `$lessonPlanOutline.sections[${section - 1}].allowed_capabilities`));
    array(draft.moments, `${path}.moments`).forEach((momentValue, momentIndex) => {
      const moment = record(momentValue, `${path}.moments[${momentIndex}]`);
      array(moment.actions, `${path}.moments[${momentIndex}].actions`).forEach((actionValue, actionIndex) => {
        const action = record(actionValue, `${path}.moments[${momentIndex}].actions[${actionIndex}]`);
        if (action.action !== "create" || action.kind !== "visual") return;
        const content = record(action.content, `${path}.moments[${momentIndex}].actions[${actionIndex}].content`);
        if (!allowedCapabilities.has(content.capability)) {
          fail("LESSON_PLAN_CAPABILITY", `${path}.moments[${momentIndex}].actions[${actionIndex}].content.capability`, "visual capability is not allowed by the course outline");
        }
      });
    });
    bySection.set(section, draft);
  });

  const assembled = {
    version: outline.version,
    title: outline.title,
    goals: structuredClone(goals),
    ...(outline.teaching_strategies === undefined ? {} : { teaching_strategies: structuredClone(outline.teaching_strategies) }),
    ...(outline.numbers === undefined ? {} : { numbers: structuredClone(outline.numbers) }),
    sections: sections.map((entry, index) => {
      const section = entry as Record<string, unknown>;
      const draft = bySection.get(index + 1);
      if (!draft) fail("LESSON_PLAN_SECTION_DRAFTS", `$lessonPlanSectionDrafts`, `section ${index + 1} is missing`);
      return {
        purpose: section.purpose,
        ...(section.reusable_items === undefined ? {} : { reusable_items: structuredClone(section.reusable_items) }),
        moments: structuredClone(draft.moments),
        ...(draft.student_activities === undefined ? {} : { student_activities: structuredClone(draft.student_activities) }),
      };
    }),
    close: structuredClone(close),
  };
  return resolveLessonPlan(assembled, options).plan;
}
