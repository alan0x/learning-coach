import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, createSign } from "node:crypto";

import authoringSchema from "../references/oll-authoring-v0.1.schema.json" with { type: "json" };
import {
  normalizeAuthoringLesson,
  reduceCanonicalEvents,
  validateAuthoringLesson,
  validateAuthoringSchema,
  compileMathExpression,
  referencedMathVariables,
  type AuthoringLesson,
  type ResourceContext,
} from "octos-lesson-language";

const TOOL_NAME = "oll_generate_lesson";
const SELECTION_TOOL_NAME = "oll_enhance_selection";
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_VERTEX_LOCATION = "global";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 270_000;
const DEFAULT_MAX_TOKENS = 32_768;
const DEFAULT_VERTEX_REQUEST_ATTEMPTS = 3;
const MAX_CONTEXT_LENGTH = 24_000;
const MAX_ERROR_BODY_LENGTH = 4_000;

type RequestSource = "self_contained" | "current_image" | "explicit_board_follow_up";

interface ToolInput {
  turn_id: string;
  learner_request: string;
  request_source: RequestSource;
  language?: string;
  tutor_context?: string;
  learner_context?: string;
  session_context?: ResourceContext;
  board_summary?: string;
  last_applied_action?: string;
  base_revision?: number;
  source_observation?: {
    kind: "live_camera" | "uploaded_image";
    recognized_problem: string;
    confidence: "high" | "medium";
  };
}

type SelectionContentKind = "text" | "math" | "geometry" | "data" | "unknown";

interface SelectionToolInput {
  turn_id: string;
  learner_request: string;
  source: {
    source_id: string;
    document_id: string;
    document_version: number;
    bounds: { x: number; y: number; width: number; height: number };
    checksum: { algorithm: "sha-256"; value: string };
  };
  content_hint: SelectionContentKind;
  recognized_content: string;
  recognition_confidence: "high" | "medium" | "low";
  lesson_title?: string;
  board_summary?: string;
}

interface SelectionEnhancementArtifact {
  profile: "octos.selection-enhancement";
  version: "0.1";
  turn_id: string;
  created_at: string;
  source: SelectionToolInput["source"];
  interpretation: {
    kind: SelectionContentKind;
    content: string;
    confidence: "high" | "medium" | "low";
  };
  response:
    | { kind: "explanation"; title: string; text: string; items?: string[] }
    | {
        kind: "plot";
        title: string;
        text: string;
        expression: string;
        x_range: { min: number; max: number };
        y_range: { min: number; max: number };
      };
}

type JsonSchema = Record<string, unknown>;
type VisualSurface = "geometry" | "plot" | "scene3d" | "diagram" | "image" | "table";
type RequestEvidenceSource = "learner_request" | "recognized_problem" | "board_summary";
type RequestItemKind =
  | "teaching_goal"
  | "visual"
  | "relationship"
  | "continuous_change"
  | "student_control"
  | "student_task"
  | "existing_board_edit"
  | "presentation_constraint"
  | "unsupported_feature";
type RequestItemPolarity = "require" | "forbid";
type PresentationCapability =
  | "visual"
  | "text"
  | "math"
  | "shape"
  | "diagram"
  | "geometry"
  | "plot"
  | "scene3d"
  | "image"
  | "table"
  | "note"
  | "animation"
  | "student_control"
  | "student_task"
  | "revise";
type RevisableNodeKind = "text" | "math" | "shape" | "diagram" | "table" | "note";
type AuthoringWriteKind =
  | "text"
  | "math"
  | "shape"
  | "diagram"
  | "geometry"
  | "plot"
  | "scene3d"
  | "image"
  | "table"
  | "note";
type AuthoringActionName =
  | "revise"
  | "emphasize"
  | "connect"
  | "group"
  | "focus"
  | "point"
  | "expression"
  | "animate";
type VisualFeature =
  | "coordinate_axes"
  | "equal_scale"
  | "circle"
  | "origin_centered_circle"
  | "unit_radius"
  | "point_on_circle"
  | "line_segments"
  | "radius_segment"
  | "projection_segment"
  | "angle_arc"
  | "function_curve"
  | "annotated_points"
  | "guides"
  | "semantic_elements"
  | "semantic_edges"
  | "source_asset"
  | "tabular_values"
  | "spatial_axes"
  | "solid_primitives"
  | "function_surface"
  | "cross_section"
  | "spatial_highlights"
  | "orbit_control";
type VisualMotionKind = "linear_point" | "angular_point" | "planar_point";

interface VisualRequirement {
  id: string;
  surface: VisualSurface;
  purpose: string;
  required_features: VisualFeature[];
  expressions: string[];
  request_item_ids: string[];
  motion_kind?: VisualMotionKind;
  motion_subject?: string;
}

interface VisualRelationshipRequirement {
  id: string;
  from: string;
  to: string;
  relation: "maps_to" | "compares_with" | "explains" | "derives";
  request_item_ids: string[];
}

interface SharedVariableRequirement {
  id: string;
  variable: string;
  purpose: string;
  initial: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  slider_step: number;
  animate_to: number;
  easing: "linear" | "ease_in_out";
  duration_intent: "brief" | "normal" | "extended";
  bound_visuals: string[];
  direct_angle_geometry: string;
  request_item_ids: string[];
}

interface StudentTaskRequirement {
  id: string;
  prompt: string;
  variable: string;
  controls: Array<"slider" | "geometry_point">;
  completion_expression: string;
  completion_value: number;
  tolerance: number;
  hints: string[];
  hint_after_attempts: number;
  success_message: string;
  request_item_ids: string[];
}

interface Scene3dTaskRequirement {
  id: string;
  prompt: string;
  visual: string;
  controls: Array<"orbit" | "zoom" | "preset" | "reset">;
  target_yaw: number;
  target_pitch: number;
  target_zoom: number;
  angular_tolerance: number;
  zoom_tolerance: number;
  hints: string[];
  hint_after_attempts: number;
  success_message: string;
  request_item_ids: string[];
}

interface RequestItem {
  id: string;
  source_ref: string;
  kind: RequestItemKind;
  polarity: RequestItemPolarity;
}

interface NonRequirementClause {
  source_ref: string;
  reason: string;
}

interface AuthoritativeRequestClause {
  ref: string;
  source: RequestEvidenceSource;
  text: string;
}

interface TeachingGoalRequirement {
  id: string;
  goal: string;
  request_item_ids: string[];
}

interface UnhandledRequestItem {
  request_item_id: string;
  status: "unsupported" | "ambiguous";
  reason: string;
}

interface PresentationConstraint {
  id: string;
  capability: PresentationCapability;
  polarity: RequestItemPolarity;
  request_item_ids: string[];
}

interface LessonBrief {
  version: "1";
  request_summary: string;
  request_items: RequestItem[];
  non_requirement_clauses: NonRequirementClause[];
  teaching_goal_requirements: TeachingGoalRequirement[];
  presentation_constraints: PresentationConstraint[];
  visual_requirements: VisualRequirement[];
  visual_relationships: VisualRelationshipRequirement[];
  shared_variable_requirements: SharedVariableRequirement[];
  student_task_requirements: StudentTaskRequirement[];
  scene3d_task_requirements: Scene3dTaskRequirement[];
  progressive_revision_kinds: RevisableNodeKind[];
  unhandled_request_items: UnhandledRequestItem[];
}

interface BriefVerification {
  missing: Array<{
    source_ref: string;
    reason: string;
  }>;
  contradictions: Array<{
    request_item_id: string;
    reason: string;
  }>;
  suggestions: Array<{
    request_item_id: string;
    suggestion: string;
  }>;
}

interface AuthoringCapabilityPlan {
  writeKinds: AuthoringWriteKind[];
  actions: AuthoringActionName[];
  reviseKinds: RevisableNodeKind[];
  allowVariables: boolean;
  bindingKinds: Array<"geometry" | "plot" | "scene3d">;
  allowAngleControl: boolean;
}

interface ParallelLessonSectionPlan {
  id: string;
  title: string;
  purpose: string;
  visualRequirementIds: string[];
}

interface GenerationViolation {
  stage: "brief" | "schema" | "semantic" | "request_coverage";
  code: string;
  path: string;
  message: string;
  requirement_id?: string;
  missing_features?: string[];
  missing_expressions?: string[];
}

interface VertexServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface VertexClient {
  endpoint: string;
  accessToken: string;
  timeoutMs: number;
  maxTokens: number;
  requestAttempts: number;
  deadlineAt?: number;
}

interface StructuredModelRequest {
  label:
    | "lesson-brief"
    | "lesson-brief-verification"
    | "lesson-authoring"
    | "lesson-section"
    | "lesson-visual-component"
    | "lesson-component-repair"
    | "lesson-beat-repair"
    | "selection-enhancement";
  turnId: string;
  systemPrompt: string;
  prompt: string;
  responseSchema: JsonSchema;
  maxTokens?: number;
}

class GeneratedLessonError extends Error {
  constructor(
    message: string,
    readonly raw?: string,
    readonly violations: GenerationViolation[] = [],
  ) {
    super(message);
    this.name = "GeneratedLessonError";
  }
}

class ToolExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

const LESSON_BRIEF_SYSTEM_PROMPT = `你是课堂需求与教学设计规划器，不生成 OLL，也不撰写课程正文。输入明确分成两部分：必须忠实满足的用户原话，以及只能辅助选择讲法、不能升级成用户要求的教学建议。

第一部分先逐条处理 authoritative_request.clauses：
- 每个 source_ref 必须二选一：如果分句表达了实际要求，就建立一个或多个 request_item；如果只是寒暄、语气词或没有可执行要求，就写入 non_requirement_clauses 并说明原因；不能遗漏，也不能同时出现在两边；
- non_requirement_clauses 不是逃避要求的地方。只要分句要求解释、展示、比较、演示、控制、修改或限制表现形式，就必须建立 request_item；

request_items 只记录用户明确提出的教学目标、视觉对象、视觉关系、连续变化、学生控制、课后动手任务、对既有白板的修改、展示限制和当前系统不支持的功能：
- 每项使用 source_ref 引用输入提供的原文分句编号，不要复制、改写或自造原文；
- polarity=require 表示必须满足，polarity=forbid 表示明确禁止；
- 不得把学科模拟或未实现的交互偷换成 diagram 或普通文字。scene3d 已支持受约束的立体、二元函数曲面、截面和视角旋转，不应标记为不支持；需要碰撞、真实材质或复杂形变时才使用 unsupported_feature；
- 每个 request_item 必须通过 request_item_ids 映射到一个或多个具体要求，或者明确列入 unhandled_request_items，不能悬空；
- teaching_goal 映射到 teaching_goal_requirements；visual 映射到 visual_requirements；relationship 映射到 visual_relationships；continuous_change 映射到 shared_variable_requirements；普通数值或几何 student_control 映射到 shared_variable_requirements，但三维视角旋转/缩放映射到带 orbit_control 的 scene3d visual_requirement；普通变量 student_task 映射到 student_task_requirements，目标视角任务映射到 scene3d_task_requirements；presentation_constraint 映射到 presentation_constraints；
- 目前没有可寻址的既有白板节点清单，因此 existing_board_edit 必须列入 unhandled_request_items，不能让后续模型猜 revise.target。

第二部分 teaching_goal_requirements、visual_requirements、visual_relationships、shared_variable_requirements、student_task_requirements 和 scene3d_task_requirements 是教学设计。它们可以根据用户目标增加合理的图形、讲解步骤和互动方式，但必须通过 request_item_ids 说明服务于哪项用户要求。不要把教学建议或你偏好的讲法伪装成用户原话，也不要因为用户没说出“恢复力箭头”之类具体教法就拒绝合理的教学设计。

教学目标和演示对象必须完整：
- 用户问某个现象“为什么发生”时，解释产生该现象的原因本身是硬教学目标；只描述周期、规律、结果或数学拟合不能替代因果解释；
- 用户要求演示某个对象或系统如何变化时，至少一个参与变化的 visual_requirement 必须直接表现该对象或系统；单位圆、函数图、能量图等类比或解释工具可以增加，但不能顶替被演示的主体；
- 同一句中有多个可独立回答的“为什么、是什么、如何变化、让我操作”等要求时，分别建立 request_item，并可共享同一个 source_ref。

只把原文分句中确实表达了要求的内容写入 request_items。寒暄、语气词和没有可执行要求的背景描述写入 non_requirement_clauses；教学建议只能影响 purpose、goal 和具体设计，不得成为新的 request_item。
每个 visual_requirement.id 必须是唯一的小写英文别名，只能包含 a-z、0-9、连字符并以字母开头；visual_relationships 的 from/to 只能引用这些 id。expressions 用于 plot 的 y=f(x) 曲线或 scene3d 的 z=f(x,y) 曲面，其他 surface 必须返回空数组。

视觉 surface：
- geometry：由有数值坐标的点、线段、圆和角弧组成的等比例二维场景。除了度量几何与坐标几何，可由数值点和线段忠实表达的简单二维物体运动也使用 geometry，例如移动质点、振子、抛体或杠杆端点；点坐标和角弧可以由共享变量驱动；
- plot：函数坐标图；曲线使用可执行表达式，数据点和辅助线可以随共享变量变化；
- scene3d：可旋转、可缩放的受约束三维场景，可包含长方体、球、圆柱、圆锥、z=f(x,y) 曲面以及 x/y/z 截面；用于空间几何、三维函数和二维截面联动，不得输出脚本、网格文件或着色器；
- diagram：静态语义节点关系图，用于流程、分类和概念关系。diagram 是静态语义关系图，不能由共享变量驱动，不得用它冒充运动中的物体；
- image：受控来源图片；
- table：表格。

选择 surface 时先判断画面需要怎样变化，而不是按学科名词归类。若主体运动能由有标签的数值点、线段、圆或角弧忠实表达，就规划为 geometry。若请求明确需要立体、空间视角、三维函数或截面，就规划 scene3d。需要真实材质、碰撞、复杂连续形变或超出受约束图元的模拟时，才将相应要求记为 unsupported_feature。

通用 feature 的含义：
- coordinate_axes：可读的数值坐标轴；equal_scale：两个坐标方向保持相同比例；
- circle：可度量圆；origin_centered_circle：圆心确实位于坐标原点；unit_radius：半径数值确实为一；
- point_on_circle：点的坐标确实落在圆上；line_segments：连接有坐标点的普通线段，可表示弹簧、杆、连杆或轨道片段；radius_segment：圆心到圆上点的线段；projection_segment：点到坐标轴的实际投影线；angle_arc：非零的可见角弧；
- function_curve：带可执行表达式的函数曲线；annotated_points：有标签的数据点；guides：数值辅助线；
- semantic_elements / semantic_edges：语义节点和语义连线；source_asset：受控图片资源；tabular_values：有行列数据的表格。
- spatial_axes：三维坐标轴；solid_primitives：至少一个受支持实体；function_surface：可执行的 z=f(x,y) 曲面；cross_section：x/y/z 截面；orbit_control：学生能旋转、缩放和复位场景视角。

feature 必须属于对应 surface：geometry 只使用 coordinate_axes、equal_scale、circle、origin_centered_circle、unit_radius、point_on_circle、line_segments、radius_segment、projection_segment、angle_arc、annotated_points；plot 只使用 coordinate_axes、function_curve、annotated_points、guides；scene3d 只使用 spatial_axes、solid_primitives、function_surface、cross_section、spatial_highlights、orbit_control；diagram 只使用 semantic_elements、semantic_edges；image 只使用 source_asset；table 只使用 tabular_values。用户要求指出三维对象的具体顶点、棱或面时，scene3d 必须包含 spatial_highlights。

如果请求点名某个视觉对象，选择能真实表达它的 surface，并列出让该对象和教学目的在画面上成立所不可缺少的最小 features。不要因为某个 surface 支持一项 feature 就自动要求它；也不要用标题、讲述或标签代替结构特征。

如果请求涉及运动、映射或量的连续变化，规划中必须包含使这个变化可见的结构；例如“旋转角度”需要真实的角度标记，“投影/坐标对应”需要实际投影结构，“函数图像”需要坐标轴和带表达式的曲线。

被 shared_variable_requirements 绑定的 geometry 还必须填写 motion_kind 和 motion_subject：
- linear_point：一个代表主体的有标签点只沿 x 或 y 一个方向变化，例如振子、小车；
- angular_point：一个代表主体的有标签点绕圆心转动，例如单位圆上的点、摆臂端点；
- planar_point：一个代表主体的有标签点的 x、y 同时变化，例如平面抛体；
- motion_subject 是该运动点在画面上必须明确显示的主体名称，例如“振子”“小车”“圆上点”，不得填写 P、A、物体等无法说明用户所问主体的泛称。只有被共享变量绑定的 geometry 填写这两个字段；plot/scene3d/diagram/image/table 不填写。

如果请求要求把两个视觉对象结合、对应、比较或推导，必须在 visual_relationships 中表达；不要把这种关系退化成两张互不相关的图。

shared_variable_requirements 用来规划“同一个量同时驱动多个视觉对象”的课程，不是给每节课机械添加动画：
- 当请求明确要求动画、可交互变化，或教学目标本身是连续运动/变化（例如角度旋转变成周期波动）时，创建 shared_variable_requirement；否则返回空数组。
- variable 是 OLL 变量名；initial/min/max/slider_step/animate_to 使用符合学科含义的数值。转满一圈用 0 到 6.283185307179586，单位用 rad。
- bound_visuals 至少列出所有被同一变量驱动的 visual_requirement.id；跨图对应通常至少有两个。
- bound_visuals 可以引用 geometry、plot 或 scene3d。scene3d 目前通过 section.value 与共享变量联动；场景视角旋转本身是学生操作，不是课程变量。diagram、image 和 table 不能绑定。
- direct_angle_geometry 只在某个 geometry 里的点适合由学生直接绕圆心拖动时填写该 visual_requirement.id，否则返回空字符串。
- 当前学生控制支持变量滑杆、圆上点绕圆心的 angle_control，以及 scene3d 视角的旋转、缩放、预设和复位；三维视角控制由 scene3d 的 orbit_control 表达，不要为它伪造 shared variable。不支持任意物体的自由拖动或沿直线拖动。一般性的“让我自己操作”或没有点明被拖物体的“拖着试试”可以用拖动滑杆满足；只有圆周角度确实是合适的教学操作时才使用 direct_angle_geometry。明确点名要拖动其他物体或沿特定路径拖动时必须列入 unhandled_request_items。

student_task_requirements 用来规划讲解结束后真正交给学生完成的短任务，不是旁白中的提问：
- 只有已经存在 shared_variable_requirement 时才能创建任务；任务必须让学生通过该变量已有的滑杆，或已有的圆周 angle_control 完成，不得规划新的交互方式。
- 当用户明确要求“让我动手试、给我一个互动任务、讲完后让我操作”时必须创建 student_task request_item 和对应任务。只要课程已经规划共享变量且用户没有禁止学生控制或任务，就必须至少设计一个能检验本课核心目标的短任务；这属于教学设计，可以引用它所服务的 teaching_goal 或 continuous_change request_item。
- variable 必须引用一个 shared_variable_requirement.variable。controls 至少包含 slider；只有该变量的 direct_angle_geometry 非空时才能增加 geometry_point。
- completion_expression 使用 Runtime 数学表达式，只能读取这个 variable；completion_value 是期望结果，tolerance 是允许误差。初始值不能已经满足完成条件。任务必须依据学生最终提交的一次操作判定，不能依靠模型阅读学生意图。
- prompt 必须像老师给学生的自然指令，说明要达到的可见目标，不要暴露内部变量名或实现术语。hints 从观察方向到更具体操作逐步给出；success_message 解释学生刚才的操作为什么正确。
- 任务按数组顺序依次开放。通常只规划一个；只有多个操作确实对应不同教学目标时才规划多个。
- scene3d_task_requirements 专门描述“把三维场景转到某个视角”的任务。visual 必须引用带 orbit_control 的 scene3d；target_yaw、target_pitch、target_zoom 是目标相机，angular_tolerance 和 zoom_tolerance 是判定容差。scene3d 的所有角度和角度容差都必须使用弧度，绝不能填写角度制数值：target_yaw 必须是有限弧度值，target_pitch 必须在 -π/2 到 π/2 之间，angular_tolerance 必须大于 0 且不超过 π；target_zoom 必须在 0.2 到 5 之间，zoom_tolerance 必须大于 0 且不超过 4.8。不要把视角任务伪装成 lesson variable。用户明确要求从某个方向观察、转到正视/俯视，或要求学生通过旋转完成任务时使用它；普通变量任务仍放在 student_task_requirements。
- 若 presentation_constraints 明确禁止 student_control 或 student_task，student_task_requirements 和 scene3d_task_requirements 都必须为空。

progressive_revision_kinds 只表示本轮新建板书是否适合用 revise 渐进替换，允许 text、math、shape、diagram、table、note；不需要时返回空数组。它不允许修改历史白板节点，也不得包含 geometry、plot、scene3d 或 image。

没有明确或必要视觉要求时 visual_requirements 可以为空，但 request_items 和 teaching_goal_requirements 仍须覆盖用户的教学请求。只输出符合 JSON Schema 的 JSON 对象。`;

const BRIEF_VERIFICATION_SYSTEM_PROMPT = `你是用户要求覆盖复核器，不生成课件，也不决定应该采用哪一种教法。

只做三件事：
1. missing：用户原文中的某一项明确要求没有被 request_items 记录。一个 source_ref 可能同时要求解释、画图和操作；即使其中一项已记录，另一项漏掉仍应报告，并在 reason 中明确说明漏了什么；
2. contradictions：某个已有 request_item 与它引用的用户原文相反，或把明确不支持的能力冒充为已支持；
3. suggestions：课程可以怎样教得更好，但这类建议绝不能放进 missing 或 contradictions。

如果用户明确问“为什么发生”，遗漏因果解释属于 missing，不是 suggestions。如果用户要求演示某个对象的变化，却只规划类比图而没有直接表现该对象，也属于 missing。复核这类请求时必须检查被绑定 geometry 的 motion_subject 和 motion_kind：motion_subject 必须明确命名用户要求观看的运动主体，motion_kind 必须描述该主体本身的运动；圆周投影、函数曲线或其他类比即使数学上相关，也不能作为主体演示通过复核。只有在因果目标和主体演示已经覆盖后，受力图、速度图、能量图等可选讲法才属于 suggestions。教学建议不是用户要求。没有发现对应项目时返回空数组。`;

const AUTHORING_SYSTEM_PROMPT = `你是一位耐心、具体、尊重学生的家庭教师。请生成一堂完整、连续的 OLL Authoring Profile 课程。

硬性要求：
1. 输出必须是一个符合所附 JSON Schema 的 JSON 对象，不输出 Markdown 或额外解释。
2. 使用 Lesson → Step → Beat → Action；每个 Beat 的 say 与 actions 必须讲同一内容。
3. 一轮完整讲完学生请求的范围，不等待学生回答，不插入测试题或确认问题。
4. 板书必须渐进出现；不要用一个长文本节点代替整堂课。
5. 只使用 OLL Authoring v0.1 动作和相对位置；不输出坐标、缩放值、时长、HTML、SVG 路径或脚本。
6. 局部别名必须小写、先定义后引用，并保持 node、fragment、connection、group 类型正确。
7. 只能使用 Session Context 明确给出的 asset_id 和 region_id；没有资源时不得编造图片资源。
8. 学生背景只用于选择讲法，不得编造画像或宣称学生已经掌握。
9. close.focus 只能引用已经创建的 node、group 或 connection。
10. 教学重点、推理顺序和最终结论必须清楚，Beat narration 可以直接作为教师课堂讲述。
11. 每个 Beat 必须包含一个 when="after_speech" 的 focus 动作，聚焦该 Beat 结束后学生应继续看的当前教学目标；不得依赖上一 Beat 或上一课程遗留焦点。
12. 用户问现象原因时必须实际讲清原因，不能只给规律或公式；用户要求演示某个对象的变化时，动态白板必须直接表现该对象，类比图只能作为辅助。

必须严格使用以下结构和字段名：
- 根对象：dsl="octos.lesson"、version="0.1"、profile="authoring"、lesson、steps、close。
- steps[]：{ key, purpose, beats }。
- beats[]：{ key, say, delivery, actions }。
- actions[] 使用字段 do；禁止使用 type、create、layout、coordinates。
- 所有 key 与 as 都必须是小写英文别名，只能包含 a-z、0-9、连字符，且必须以字母开头。
- write 必须包含 as、kind、role、content、place；content 必须是对象，place 至少包含 relation。
- write.content 必须匹配 kind：text/shape 使用非空 text；math 使用 latex；note 使用 title 和 items；table 使用 columns 和 rows；diagram 使用 elements；geometry 使用 axes、points 和几何原语；plot 使用 axes 和 curves；scene3d 使用 camera 和 objects；image 使用受控 asset_id。不得用无关的 text 字段代替结构化视觉内容。
- 混合文字与公式的题干或解释使用 kind="text" 或 kind="note"，在 content.text 中只给公式片段加单美元符号（如 $\\sqrt{x-1}$）或 \\(...\\) 定界符；不得把裸 LaTeX 命令直接混入普通文字。
- 以公式为主体的板书使用 kind="math" 并把规范公式写入 content.latex；content.text 只作为可选的可读后备，不要复制带定界符的公式串。
- diagram 只用于语义元素与连线，不得表示圆、角、坐标轴、投影或其他度量几何。geometry 用于等比例坐标系中的圆、点、线段、投影和角弧；axes 必须包含 x/y 数值范围和 equal_scale=true。
- geometry.points[] 每项包含 as、x、y；circles[] 使用 center point alias 和正 radius；segments[] 使用 from/to point alias，投影线使用 style="projection"；arcs[] 使用 center、radius、start_angle、end_angle，角度为弧度。模型不得输出 SVG 或像素坐标。
- diagram 用于语义元素与连线，不得冒充函数图像。plot 用于坐标轴上的函数曲线；content.axes.x/y 各给出数值 min/max，content.curves[] 每项必须包含 as、expression，可包含 label。
- plot.expression 只写受限数学表达式，例如 sin(x)、cos(x)、(x+3)^2-4；支持 x、pi、e、+ - * / ^、括号以及 sin/cos/tan/sqrt/abs/exp/log，不写 y=、LaTeX、代码或 SVG。
- scene3d.camera 包含 yaw、pitch、zoom；scene3d.camera 的所有角度都使用弧度，camera.yaw 必须是有限弧度值，camera.pitch 必须在 -π/2 到 π/2 之间，camera.zoom 必须在 0.2 到 5 之间，绝不能把角度制数值直接填入相机字段。fallback 必须用一句话说明交互不可用时学生仍应看懂的空间关系；objects[] 只使用 box、sphere、cylinder、cone、surface。box 给 center 和 size；球给 center/radius；圆柱和圆锥再给 height；surface 给 z=f(x,y) 的 expression、x_range、y_range 和 4 到 24 的 samples。sections[] 使用 as、axis=x/y/z、value。highlights[] 使用 as、kind=point/edge/face、明确的三维 points、可选 label/color，不能使用含糊的“第一个面”。场景天然支持视角旋转、缩放、等轴/正视/俯视和复位，不要输出这些交互的脚本。
- 输入中的课程要求清单是本轮请求的可执行要求合同；每个 visual_requirement 和 visual_relationship 都必须由实际白板动作满足，标题、goals、讲述或文字声明不能替代要求的视觉内容。
- 每个 visual_requirement.id 就是该主要视觉节点必须使用的 write.as；一个视觉节点可以通过 request_item_ids 服务多个教学目标。visual_relationships 对应的 connect 由系统在两个节点创建后插入，模型不要输出 connect。
- 课程要求清单中的 shared_variable_requirements 非空时，系统会确定性写入 lesson.variables 和可判定的 angle_control；模型负责在 bound_visuals 对应的 geometry/plot/scene3d content.bindings 中引用同一个变量，并把 do="animate" 动作放进合适的讲解节拍。scene3d 绑定目标目前只允许 section.value。禁止复制第二份状态。
- geometry visual_requirement 包含 motion_kind/motion_subject 时，必须有一个 label 明确包含 motion_subject 的点代表运动主体。linear_point 只绑定该点的 x 或 y 一个坐标；planar_point 同时绑定 x/y；angular_point 同时绑定 x/y，并通过半径线或角控制表明它绕固定中心运动。单位圆或其他类比图不能冒充用户要求直接演示的主体。
- bindings.target 使用“局部元素别名.数值属性”，expression 使用受限表达式并直接引用变量名。例如单位圆与正弦图共享 theta：point-p.x=cos(theta)、point-p.y=sin(theta)、foot.x=cos(theta)、theta-arc.end_angle=theta、current-angle.x=theta、current-angle.y=sin(theta)。
- animate 只描述语义目标，包含 variable、value，可包含 easing 和 duration_intent；不得生成毫秒时长。学生可在 Runtime 中播放、暂停、拖动、复位和重放。
- 动画必须单独占用一个简短 Beat：相关 geometry/plot 和 connect 必须在更早的 Beat 已经创建；动画 Beat 只包含一个 do="animate" 和本 Beat 必需的 after_speech focus，不得同时 write、connect、group、revise、point 或 emphasize。
- 动画 Beat 的 say 只说一到两句观察提示，中文不超过 36 个字符，其他语言不超过 22 个词。不要在动画播放时讲完整推导；推导和结论放到前后相邻 Beat。
- animate 必须使用 when="during_speech" 或省略 when 使用默认值。Runtime 会在旁白音频真正开始后再启动动画；不要用 before_speech 或 after_speech 绕开这一时序。
- geometry 点只有在课程要求清单指定 direct_angle_geometry 时才允许 angle_control；模型必须提供同时驱动圆上点 x/y 的变量绑定，以及连接圆心和该点的半径线，系统才会确定性补入 interaction。
- 每个 Beat 的 say 必须使用适合 TTS 朗读的自然语言表达数学关系，不得包含美元符号、反斜杠命令或其他原始 LaTeX 标记。
- revise 必须包含 target、content、reason；emphasize 必须包含 target、emphasis。
- 本次课程的 connect 由系统根据 visual_relationships 插入，模型不得输出 connect；group 必须包含 as、role、label、members。
- focus 必须包含 targets、intent；point 必须包含 target；expression 必须包含 expression。
- 写板书示例：{"do":"write","as":"rule","kind":"note","role":"concept","content":{"title":"规律","items":["内容"]},"place":{"relation":"new_region"}}。
- 三角函数图像示例：{"do":"write","as":"trig-curves","kind":"plot","role":"diagram","content":{"axes":{"x":{"min":0,"max":6.283185307179586},"y":{"min":-1.2,"max":1.2}},"curves":[{"as":"sine-curve","expression":"sin(x)","label":"y = sin x"},{"as":"cosine-curve","expression":"cos(x)","label":"y = cos x"}]},"place":{"relation":"new_region"}}。
- 单位圆示例：{"do":"write","as":"unit-circle","kind":"geometry","role":"diagram","content":{"axes":{"x":{"min":-1.25,"max":1.25,"label":"x"},"y":{"min":-1.25,"max":1.25,"label":"y"},"equal_scale":true},"points":[{"as":"origin","x":0,"y":0,"label":"O"},{"as":"point-p","x":0.5,"y":0.8660254,"label":"P(cos θ, sin θ)"},{"as":"foot","x":0.5,"y":0}],"circles":[{"as":"circle","center":"origin","radius":1,"label":"r = 1"}],"segments":[{"as":"radius","from":"origin","to":"point-p","style":"solid"},{"as":"projection","from":"point-p","to":"foot","label":"sin θ","style":"projection"}],"arcs":[{"as":"theta","center":"origin","radius":0.28,"start_angle":0,"end_angle":1.0471975512,"label":"θ"}]},"place":{"relation":"new_region"}}。
- 共享变量动画示例：{"do":"animate","variable":"theta","value":6.283185307179586,"easing":"linear","duration_intent":"extended"}。
- 聚焦示例：{"do":"focus","when":"after_speech","targets":["rule"],"intent":"current_step"}。`;

const COMPONENT_REPAIR_SYSTEM_PROMPT = `你是 OLL 局部视觉对象修复器。输入会给出一个已经存在的 write 动作、它必须满足的视觉要求，以及该动作当前未满足的检查项。

只返回修复后的一个完整 write 动作，不返回 Lesson、Step、Beat、Markdown 或解释。必须保持 do="write"、write.as、write.kind、role 和 place 的原有语义，只修改这个视觉对象本身。不得创建其他节点、关系、动画、旁白或课程结构。输出必须符合所附 JSON Schema。`;

const BEAT_REPAIR_SYSTEM_PROMPT = `你是 OLL 局部教学节拍修复器。输入会给出一个出错的 Beat、此前已经存在的别名，以及该 Beat 的精确校验错误。

只返回修复后的一个完整 Beat，不返回 Lesson、Step、Markdown 或解释。保持 beat.key 不变，只修改这个 Beat 的 say、delivery 和 actions。不得重新创建 existing_aliases 中的节点或关系；需要继续讲解已有视觉对象时直接引用其别名，或用新的 text、math、note 等节点补充。每个 Beat 必须包含一个 when="after_speech" 的 focus。输出必须符合所附 JSON Schema。`;

const PARALLEL_SECTION_SYSTEM_PROMPT = `你是独立课程分段编写器。你只编写一段课程的一个完整 Step，其他分段会同时由其他编写器完成，最后由程序按顺序组装。

只返回一个符合所附 JSON Schema 的 Step 对象，不返回 Lesson、close、Markdown 或解释。只讲输入 section.purpose 指定的内容，不重复完整课程。主要 geometry、plot、scene3d、diagram、image、table 视觉对象由程序另行生成和插入；你不得创建这些主要视觉对象。你只能用 text、math、note 或 shape 写必要板书，并用 focus 引用本段新建节点或 available_visuals 中的稳定别名。不要引用其他分段可能创建的文字节点，因为这些分段正在并行生成。每个 Beat 必须包含一个 when="after_speech" 的 focus，say 必须是适合 TTS 的自然语言，不包含 Markdown 或 LaTeX 定界符。write.content 必须匹配 kind：text/shape 使用非空 text，math 使用 latex，note 使用 title 和 items。所有 key 与 as 只能使用小写英文字母、数字和连字符。`;

const VISUAL_COMPONENT_SYSTEM_PROMPT = `你是独立视觉组件编写器。你只生成课程要求中指定的一个主要视觉对象，其他视觉对象和课程讲解会同时生成，最后由程序组装。

只返回一个完整 write 动作，不返回 Lesson、Step、Beat、close、Markdown 或解释。必须保持 do="write"、as 与 visual_requirement.id 完全相同、kind 与 visual_requirement.surface 完全相同，并实现 required_features、expressions、运动主体和共享变量绑定。不得创建其他节点、connect、animate、旁白或教学任务。输出必须符合所附 JSON Schema。只写满足要求的最小充分内容，不要枚举没有被要求的额外元素，也不要填充无关可选字段。

geometry 用于坐标轴、点、圆、线段、投影和角弧，不得用 diagram 冒充度量几何。visual_requirement.motion_subject 非空时，代表运动主体的 point.label 必须包含这段 motion_subject 原文，让学生能看出是谁在运动；linear_point 只绑定该点的 x 或 y，planar_point 同时绑定 x/y，angular_point 同时绑定 x/y 并用半径线连接固定中心。共享角变量要直接绑定这个点。plot 的曲线 expression 只写 Runtime 表达式，例如 sin(x)、cos(x)，不得写 y=、LaTeX、代码或 SVG。scene3d 的 camera、objects、sections、highlights 必须使用结构化字段，surface.expression 使用 z=f(x,y) 的受限表达式。scene3d.camera 的所有角度都使用弧度；camera.yaw 必须是有限弧度值，camera.pitch 必须在 -π/2 到 π/2 之间，camera.zoom 必须在 0.2 到 5 之间，绝不能把角度制数值直接填入相机字段。diagram 只用于语义元素和关系。image 只能引用 session_context 中明确给出的 asset_id。bindings.target 使用“局部元素别名.数值属性”，expression 直接引用 shared_variables 中的变量。不得输出像素坐标、HTML、SVG 路径或脚本。所有局部别名只能使用小写英文字母、数字和连字符。`;

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function validateTurnId(value: unknown): string {
  const turnId = requireNonEmptyString(value, "turn_id");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(turnId) || turnId.includes("..")) {
    throw new Error("turn_id contains unsupported path characters");
  }
  return turnId;
}

function truncate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= MAX_CONTEXT_LENGTH
    ? value
    : `${value.slice(0, MAX_CONTEXT_LENGTH)}\n[context truncated]`;
}

function parseToolInput(raw: string): ToolInput {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Tool input is not valid JSON: ${(error as Error).message}`);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Tool input must be a JSON object");
  }
  const input = candidate as Record<string, unknown>;
  const baseRevision = input.base_revision;
  if (baseRevision !== undefined && (!Number.isSafeInteger(baseRevision) || Number(baseRevision) < 0)) {
    throw new Error("base_revision must be a non-negative integer");
  }
  let sourceObservation: ToolInput["source_observation"];
  if (input.source_observation !== undefined) {
    if (!input.source_observation || typeof input.source_observation !== "object" || Array.isArray(input.source_observation)) {
      throw new Error("source_observation must be an object");
    }
    const source = input.source_observation as Record<string, unknown>;
    if (source.kind !== "live_camera" && source.kind !== "uploaded_image") {
      throw new Error("source_observation.kind must be live_camera or uploaded_image");
    }
    if (source.confidence !== "high" && source.confidence !== "medium") {
      throw new Error("source_observation.confidence must be high or medium");
    }
    sourceObservation = {
      kind: source.kind,
      recognized_problem: truncate(requireNonEmptyString(
        source.recognized_problem,
        "source_observation.recognized_problem",
      ))!,
      confidence: source.confidence,
    };
  }
  const learnerRequest = requireNonEmptyString(input.learner_request, "learner_request");
  const requestSource = requireNonEmptyString(input.request_source, "request_source");
  if (
    requestSource !== "self_contained"
    && requestSource !== "current_image"
    && requestSource !== "explicit_board_follow_up"
  ) {
    throw new Error(
      "request_source must be self_contained, current_image, or explicit_board_follow_up",
    );
  }
  if (requestSource === "current_image" && !sourceObservation) {
    throw new Error(
      "source_observation is required when request_source is current_image; inspect the current frame instead of using existing board history",
    );
  }
  if (requestSource !== "current_image" && sourceObservation) {
    throw new Error("source_observation is only allowed when request_source is current_image");
  }
  const boardSummary = typeof input.board_summary === "string"
    ? truncate(input.board_summary)
    : undefined;
  if (requestSource === "explicit_board_follow_up" && !boardSummary?.trim()) {
    throw new Error(
      "board_summary is required when request_source is explicit_board_follow_up",
    );
  }
  return {
    turn_id: validateTurnId(input.turn_id),
    learner_request: learnerRequest,
    request_source: requestSource,
    ...(typeof input.language === "string" ? { language: truncate(input.language) } : {}),
    ...(typeof input.tutor_context === "string" ? { tutor_context: truncate(input.tutor_context) } : {}),
    ...(typeof input.learner_context === "string" ? { learner_context: truncate(input.learner_context) } : {}),
    ...(input.session_context && typeof input.session_context === "object" && !Array.isArray(input.session_context)
      ? { session_context: input.session_context as ResourceContext }
      : {}),
    ...(boardSummary ? { board_summary: boardSummary } : {}),
    ...(typeof input.last_applied_action === "string" ? { last_applied_action: truncate(input.last_applied_action) } : {}),
    ...(baseRevision !== undefined ? { base_revision: Number(baseRevision) } : {}),
    ...(sourceObservation ? { source_observation: sourceObservation } : {}),
  };
}

function parseSelectionToolInput(raw: string): SelectionToolInput {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Tool input is not valid JSON: ${(error as Error).message}`);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Selection tool input must be a JSON object");
  }
  const input = candidate as Record<string, unknown>;
  const sourceValue = input.source;
  if (!sourceValue || typeof sourceValue !== "object" || Array.isArray(sourceValue)) {
    throw new Error("source must be an object");
  }
  const source = sourceValue as Record<string, unknown>;
  const boundsValue = source.bounds;
  if (!boundsValue || typeof boundsValue !== "object" || Array.isArray(boundsValue)) {
    throw new Error("source.bounds must be an object");
  }
  const bounds = boundsValue as Record<string, unknown>;
  const finite = (value: unknown, label: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label} must be finite`);
    }
    return value;
  };
  const width = finite(bounds.width, "source.bounds.width");
  const height = finite(bounds.height, "source.bounds.height");
  if (width <= 0 || height <= 0) throw new Error("source bounds must have positive size");
  const checksumValue = source.checksum;
  if (!checksumValue || typeof checksumValue !== "object" || Array.isArray(checksumValue)) {
    throw new Error("source.checksum must be an object");
  }
  const checksum = checksumValue as Record<string, unknown>;
  if (checksum.algorithm !== "sha-256" || typeof checksum.value !== "string"
    || !/^[a-f0-9]{64}$/.test(checksum.value)) {
    throw new Error("source.checksum must be a sha-256 checksum");
  }
  const documentVersion = source.document_version;
  if (!Number.isSafeInteger(documentVersion) || Number(documentVersion) < 0) {
    throw new Error("source.document_version must be a non-negative integer");
  }
  const contentHint = input.content_hint;
  if (!["text", "math", "geometry", "data", "unknown"].includes(String(contentHint))) {
    throw new Error("content_hint is invalid");
  }
  const confidence = input.recognition_confidence;
  if (!["high", "medium", "low"].includes(String(confidence))) {
    throw new Error("recognition_confidence is invalid");
  }
  return {
    turn_id: validateTurnId(input.turn_id),
    learner_request: truncate(requireNonEmptyString(input.learner_request, "learner_request"))!,
    source: {
      source_id: requireNonEmptyString(source.source_id, "source.source_id"),
      document_id: requireNonEmptyString(source.document_id, "source.document_id"),
      document_version: Number(documentVersion),
      bounds: {
        x: finite(bounds.x, "source.bounds.x"),
        y: finite(bounds.y, "source.bounds.y"),
        width,
        height,
      },
      checksum: { algorithm: "sha-256", value: checksum.value },
    },
    content_hint: contentHint as SelectionContentKind,
    recognized_content: truncate(requireNonEmptyString(
      input.recognized_content,
      "recognized_content",
    ))!,
    recognition_confidence: confidence as "high" | "medium" | "low",
    ...(typeof input.lesson_title === "string"
      ? { lesson_title: truncate(input.lesson_title) }
      : {}),
    ...(typeof input.board_summary === "string"
      ? { board_summary: truncate(input.board_summary) }
      : {}),
  };
}

/** Build a compact request-only JSON Schema for Vertex controlled generation.
 * Keep references and conditional action requirements, but remove constraints
 * that add decoder states without affecting the final frozen-schema check. */
function buildVertexResponseJsonSchema(root: JsonSchema): JsonSchema {
  const omitted = new Set([
    "$schema", "$id", "title", "description", "pattern", "format",
    "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength",
    "exclusiveMinimum", "exclusiveMaximum",
  ]);
  const convert = (raw: unknown): unknown => {
    if (!raw || typeof raw !== "object") return raw;
    if (Array.isArray(raw)) return raw.map(convert);
    const source = raw as JsonSchema;
    const result: JsonSchema = {};
    for (const [key, value] of Object.entries(source)) {
      if (omitted.has(key) && (value === null || typeof value !== "object")) continue;
      if (key === "const") {
        if (typeof value === "string" || typeof value === "number") {
          result.enum = [value];
        } else if (typeof value === "boolean") {
          result.type = "boolean";
        }
      } else {
        result[key] = convert(value);
      }
    }
    return result;
  };
  const compact = convert(root) as JsonSchema;
  const definitions = compact.$defs as JsonSchema | undefined;
  const action = definitions?.action as JsonSchema | undefined;
  const actionProperties = action?.properties as JsonSchema | undefined;
  if (definitions && actionProperties) {
    const alias = { $ref: "#/$defs/alias" };
    const stringArray = { type: "array", items: { type: "string" } };
    const fragments = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as"],
        properties: {
          as: alias,
          text: { type: "string" },
          latex: { type: "string" },
        },
      },
    };
    const axisRange = {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: { min: { type: "number" }, max: { type: "number" } },
    };
    const axes = {
      type: "object",
      additionalProperties: false,
      required: ["x", "y"],
      properties: { x: axisRange, y: axisRange },
    };
    const curves = {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "expression"],
        properties: {
          as: alias,
          expression: { type: "string" },
          label: { type: "string" },
        },
      },
    };
    const points = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "x", "y"],
        properties: {
          as: alias,
          x: { type: "number" },
          y: { type: "number" },
          label: { type: "string" },
          visible: { type: "boolean" },
        },
      },
    };
    const bindings = {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/valueBinding" },
    };
    const guides = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "kind", "value"],
        properties: {
          as: alias,
          kind: { enum: ["vertical_line", "horizontal_line"] },
          value: { type: "number" },
          label: { type: "string" },
        },
      },
    };
    const diagramElements = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "label"],
        properties: {
          as: alias,
          label: { type: "string" },
          semantic_position: {
            enum: ["top", "top_left", "top_right", "left", "center", "right", "bottom_left", "bottom_center", "bottom_right", "bottom"],
          },
        },
      },
    };
    const diagramEdges = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "from", "to"],
        properties: {
          as: alias,
          from: alias,
          to: alias,
          label: { type: "string" },
        },
      },
    };
    const diagramRegions = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "members"],
        properties: {
          as: alias,
          members: { type: "array", items: alias },
          label: { type: "string" },
        },
      },
    };
    const geometryAxis = {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: { min: { type: "number" }, max: { type: "number" }, label: { type: "string" } },
    };
    const geometryAxes = {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "equal_scale"],
      properties: { x: geometryAxis, y: geometryAxis, equal_scale: { type: "boolean" } },
    };
    const geometryPoints = { ...structuredClone(points), minItems: 1 };
    const geometryPointItems = geometryPoints.items as JsonSchema;
    const geometryPointProperties = geometryPointItems.properties as JsonSchema;
    geometryPointProperties.interaction = {
      type: "object",
      additionalProperties: false,
      required: ["kind", "variable", "center"],
      properties: {
        kind: { enum: ["angle_control"] },
        variable: { type: "string" },
        center: alias,
      },
    };
    const geometryCircles = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "center", "radius"],
        properties: {
          as: alias,
          center: alias,
          radius: { type: "number" },
          label: { type: "string" },
        },
      },
    };
    const geometrySegments = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "from", "to"],
        properties: {
          as: alias,
          from: alias,
          to: alias,
          label: { type: "string" },
          style: { enum: ["solid", "dashed", "projection"] },
        },
      },
    };
    const geometryArcs = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "center", "radius", "start_angle", "end_angle"],
        properties: {
          as: alias,
          center: alias,
          radius: { type: "number" },
          start_angle: { type: "number" },
          end_angle: { type: "number" },
          label: { type: "string" },
        },
      },
    };
    const point3d = {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "z"],
      properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
    };
    const size3d = structuredClone(point3d);
    const range3d = {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: { min: { type: "number" }, max: { type: "number" } },
    };
    const scene3dObjects = {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "kind"],
        properties: {
          as: alias,
          kind: { enum: ["box", "sphere", "cylinder", "cone", "surface"] },
          label: { type: "string" },
          color: { enum: ["teal", "blue", "purple", "orange", "red", "gray"] },
          center: point3d,
          size: size3d,
          radius: { type: "number" },
          height: { type: "number" },
          expression: { type: "string" },
          x_range: range3d,
          y_range: range3d,
          samples: { type: "integer" },
        },
      },
    };
    const scene3dSections = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "axis", "value"],
        properties: {
          as: alias,
          axis: { enum: ["x", "y", "z"] },
          value: { type: "number" },
          label: { type: "string" },
          color: { enum: ["teal", "blue", "purple", "orange", "red", "gray"] },
        },
      },
    };
    const scene3dCamera = {
      type: "object",
      additionalProperties: false,
      required: ["yaw", "pitch", "zoom"],
      properties: { yaw: { type: "number" }, pitch: { type: "number" }, zoom: { type: "number" } },
    };
    const scene3dHighlights = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["as", "kind", "points"],
        properties: {
          as: alias,
          kind: { enum: ["point", "edge", "face"] },
          points: { type: "array", minItems: 1, items: point3d },
          label: { type: "string" },
          color: { enum: ["teal", "blue", "purple", "orange", "red", "gray"] },
        },
      },
    };
    const writeContentByKind: Record<string, JsonSchema> = {
      text: {
        type: "object", additionalProperties: false, required: ["text"],
        properties: { title: { type: "string" }, text: { type: "string" }, fragments, caption: { type: "string" } },
      },
      math: {
        type: "object", additionalProperties: false, required: ["latex"],
        properties: { title: { type: "string" }, latex: { type: "string" }, text: { type: "string" }, fragments, caption: { type: "string" } },
      },
      shape: {
        type: "object", additionalProperties: false, required: ["text"],
        properties: { title: { type: "string" }, text: { type: "string" }, caption: { type: "string" } },
      },
      diagram: {
        type: "object", additionalProperties: false, required: ["elements"],
        properties: { title: { type: "string" }, elements: diagramElements, edges: diagramEdges, regions: diagramRegions, caption: { type: "string" } },
      },
      geometry: {
        type: "object", additionalProperties: false, required: ["axes", "points"],
        properties: {
          title: { type: "string" }, axes: geometryAxes, points: geometryPoints,
          circles: geometryCircles, segments: geometrySegments, arcs: geometryArcs,
          bindings,
          caption: { type: "string" },
        },
      },
      plot: {
        type: "object", additionalProperties: false, required: ["axes", "curves"],
        properties: { title: { type: "string" }, axes, curves, points, guides, bindings, caption: { type: "string" } },
      },
      scene3d: {
        type: "object", additionalProperties: false, required: ["objects", "camera", "fallback"],
        properties: {
          title: { type: "string" },
          caption: { type: "string" },
          fallback: { type: "string" },
          axes: { type: "boolean" },
          camera: scene3dCamera,
          objects: scene3dObjects,
          sections: scene3dSections,
          highlights: scene3dHighlights,
          bindings,
        },
      },
      image: structuredClone(definitions.imageContent),
      table: {
        type: "object", additionalProperties: false, required: ["columns", "rows"],
        properties: {
          title: { type: "string" },
          columns: stringArray,
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          caption: { type: "string" },
        },
      },
      note: {
        type: "object", additionalProperties: false, required: ["title", "items"],
        properties: { title: { type: "string" }, items: stringArray, text: { type: "string" }, caption: { type: "string" } },
      },
    };
    const reviseContentByKind = Object.fromEntries(
      (["text", "math", "shape", "diagram", "table", "note"] as const).map((kind) => [
        kind,
        structuredClone(writeContentByKind[kind]),
      ]),
    );
    const reviseContent = {
      anyOf: Object.values(reviseContentByKind).map((content) => structuredClone(content)),
    };
    const requiredByAction: Record<string, string[]> = {
      revise: ["target", "content", "reason"],
      emphasize: ["target", "emphasis"],
      connect: ["as", "from", "to", "relation"],
      group: ["as", "role", "label", "members"],
      focus: ["targets", "intent"],
      point: ["target"],
      expression: ["expression"],
      animate: ["variable", "value"],
    };
    definitions.action = {
      anyOf: [
        ...Object.entries(writeContentByKind).map(([kind, content]) => ({
          type: "object",
          additionalProperties: false,
          required: ["do", "as", "kind", "role", "content", "place"],
          properties: {
            do: { enum: ["write"] },
            when: structuredClone(actionProperties.when),
            as: structuredClone(actionProperties.as),
            kind: { enum: [kind] },
            role: structuredClone(actionProperties.role),
            content,
            place: structuredClone(actionProperties.place),
          },
        })),
        ...Object.entries(requiredByAction).map(([actionName, requiredFields]) => {
        const propertyNames = ["do", "when", ...requiredFields];
        return {
          type: "object",
          additionalProperties: false,
          required: ["do", ...requiredFields],
          properties: Object.fromEntries(propertyNames.map((propertyName) => [
            propertyName,
            propertyName === "do"
              ? { enum: [actionName] }
              : propertyName === "content"
                ? structuredClone(reviseContent)
                : structuredClone(actionProperties[propertyName]),
          ])),
        };
        }),
      ],
    };
  }
  return compact;
}

const vertexResponseJsonSchema = buildVertexResponseJsonSchema(authoringSchema as JsonSchema);

const baseWriteKinds: AuthoringWriteKind[] = ["text", "math", "shape", "note"];
const baseActionNames: AuthoringActionName[] = [
  "emphasize", "connect", "group", "focus", "point", "expression",
];
const revisableNodeKinds: RevisableNodeKind[] = ["text", "math", "shape", "diagram", "table", "note"];
const presentationCapabilities: PresentationCapability[] = [
  "visual", "text", "math", "shape", "diagram", "geometry", "plot", "scene3d", "image", "table", "note",
  "animation", "student_control", "student_task", "revise",
];
const visualWriteKinds = new Set<AuthoringWriteKind>(["shape", "diagram", "geometry", "plot", "scene3d", "image", "table"]);

function deriveAuthoringCapabilityPlan(input: ToolInput, brief: LessonBrief): AuthoringCapabilityPlan {
  if (brief.unhandled_request_items.length > 0) {
    const details = brief.unhandled_request_items
      .map((item) => `${item.request_item_id}: ${item.reason}`)
      .join("; ");
    throw new ToolExecutionError("UNSUPPORTED_REQUIREMENT", `The request contains unsupported or ambiguous requirements: ${details}`);
  }

  const writeKinds = new Set<AuthoringWriteKind>(baseWriteKinds);
  for (const requirement of brief.visual_requirements) writeKinds.add(requirement.surface);
  for (const kind of brief.progressive_revision_kinds) writeKinds.add(kind);

  const actions = new Set<AuthoringActionName>(baseActionNames);
  if (brief.shared_variable_requirements.length > 0) actions.add("animate");
  if (brief.progressive_revision_kinds.length > 0) actions.add("revise");

  const bindingKinds = new Set<"geometry" | "plot" | "scene3d">();
  const visualById = new Map(brief.visual_requirements.map((item) => [item.id, item] as const));
  let allowAngleControl = false;
  for (const variable of brief.shared_variable_requirements) {
    for (const visualId of variable.bound_visuals) {
      const visual = visualById.get(visualId);
      if (visual?.surface === "geometry" || visual?.surface === "plot" || visual?.surface === "scene3d") bindingKinds.add(visual.surface);
    }
    if (variable.direct_angle_geometry) allowAngleControl = true;
  }

  const explicitlyRequiredSurfaces = new Set(brief.visual_requirements.map((item) => item.surface));
  const hasScene3dViewControl = brief.visual_requirements.some(
    (item) => item.surface === "scene3d" && item.required_features.includes("orbit_control"),
  );
  for (const constraint of brief.presentation_constraints) {
    const capability = constraint.capability;
    const forbid = constraint.polarity === "forbid";
    if (capability === "visual") {
      if (!forbid) {
        if (explicitlyRequiredSurfaces.size === 0) {
          throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "A generic visual requirement must name a concrete supported surface");
        }
        continue;
      }
      if ([...explicitlyRequiredSurfaces].some((kind) => visualWriteKinds.has(kind))) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request both requires and forbids visual output");
      }
      for (const kind of visualWriteKinds) writeKinds.delete(kind);
      continue;
    }
    if ((["text", "math", "shape", "diagram", "geometry", "plot", "scene3d", "image", "table", "note"] as string[]).includes(capability)) {
      const kind = capability as AuthoringWriteKind;
      if (forbid) {
        if (explicitlyRequiredSurfaces.has(kind as VisualSurface)) {
          throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", `The request both requires and forbids ${kind}`);
        }
        writeKinds.delete(kind);
      } else {
        writeKinds.add(kind);
      }
      continue;
    }
    if (capability === "animation") {
      if (forbid && brief.shared_variable_requirements.length > 0) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request both requires continuous animation and forbids animation");
      }
      if (forbid) actions.delete("animate");
      continue;
    }
    if (capability === "student_control") {
      if (forbid && (brief.shared_variable_requirements.length > 0 || hasScene3dViewControl)) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request both requires and forbids student control");
      }
      if (forbid) allowAngleControl = false;
      continue;
    }
    if (capability === "student_task") {
      const taskCount = brief.student_task_requirements.length
        + brief.scene3d_task_requirements.length;
      if (forbid && taskCount > 0) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request both requires and forbids an after-lesson student task");
      }
      if (!forbid && taskCount === 0) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request requires an after-lesson student task, but none was planned");
      }
      continue;
    }
    if (capability === "revise") {
      if (forbid) {
        actions.delete("revise");
      } else if (brief.progressive_revision_kinds.length === 0) {
        throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "A requested progressive revision must name at least one supported node kind");
      }
    }
  }

  if (writeKinds.has("image") && !(input.session_context?.assets?.length)) {
    throw new ToolExecutionError("BRIEF_IMAGE_RESOURCE_UNAVAILABLE", "The course requires an image, but no authorized image asset is available");
  }
  if (writeKinds.size === 0) {
    throw new ToolExecutionError("REQUIREMENT_CAPABILITY_CONFLICT", "The request forbids every supported board-writing capability");
  }

  return {
    writeKinds: [...writeKinds].sort(),
    actions: [...actions].sort(),
    reviseKinds: actions.has("revise") ? [...brief.progressive_revision_kinds].sort() : [],
    allowVariables: brief.shared_variable_requirements.length > 0,
    bindingKinds: [...bindingKinds].sort(),
    allowAngleControl,
  };
}

function actionVariantIdentity(variant: JsonSchema): { action?: string; kind?: string } {
  const properties = variant.properties as JsonSchema | undefined;
  const action = properties?.do as JsonSchema | undefined;
  const kind = properties?.kind as JsonSchema | undefined;
  return {
    action: Array.isArray(action?.enum) && typeof action.enum[0] === "string" ? action.enum[0] : undefined,
    kind: Array.isArray(kind?.enum) && typeof kind.enum[0] === "string" ? kind.enum[0] : undefined,
  };
}

function pruneUnusedDefinitions(schema: JsonSchema): JsonSchema {
  const definitions = isRecord(schema.$defs) ? schema.$defs : {};
  const retained = new Set<string>();
  const queue: string[] = [];
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/$defs/")) {
      const name = value.$ref.slice("#/$defs/".length).split("/", 1)[0];
      if (name && !retained.has(name)) queue.push(name);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "$defs") inspect(child);
    }
  };
  const rootWithoutDefinitions = structuredClone(schema);
  delete rootWithoutDefinitions.$defs;
  inspect(rootWithoutDefinitions);
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (retained.has(name)) continue;
    const definition = definitions[name];
    if (!definition) throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `Missing local Schema definition '${name}'`);
    retained.add(name);
    inspect(definition);
  }
  return {
    ...rootWithoutDefinitions,
    ...(retained.size > 0
      ? { $defs: Object.fromEntries([...retained].sort().map((name) => [name, structuredClone(definitions[name])])) }
      : {}),
  };
}

const supportedVertexSchemaKeywords = new Set([
  "type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "$defs", "$ref",
  "minItems", "maxItems",
]);

function assertVertexSchemaCompatible(schema: JsonSchema): void {
  const visit = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (!supportedVertexSchemaKeywords.has(key)) {
        throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `Unsupported Vertex Schema keyword at ${path}/${key}`);
      }
      if (key === "enum") {
        if (!Array.isArray(child) || child.some((item) => typeof item !== "string" && typeof item !== "number")) {
          throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `Vertex enum contains an unsupported value at ${path}/enum`);
        }
        continue;
      }
      if (key === "properties" || key === "$defs") {
        if (!isRecord(child)) throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `${path}/${key} must be an object`);
        for (const [name, nested] of Object.entries(child)) visit(nested, `${path}/${key}/${name}`);
        continue;
      }
      if (key === "items") visit(child, `${path}/items`);
      if (key === "anyOf") {
        if (!Array.isArray(child)) throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `${path}/anyOf must be an array`);
        child.forEach((nested, index) => visit(nested, `${path}/anyOf/${index}`));
      }
    }
    if (typeof value.$ref === "string" && Object.keys(value).length !== 1) {
      throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `$ref must not have sibling keywords at ${path}`);
    }
    if (Array.isArray(value.required) && isRecord(value.properties)) {
      for (const requiredProperty of value.required) {
        if (typeof requiredProperty !== "string" || !(requiredProperty in value.properties)) {
          throw new ToolExecutionError(
            "VERTEX_SCHEMA_INCOMPATIBLE",
            `Required property '${String(requiredProperty)}' is not declared at ${path}/properties`,
          );
        }
      }
    }
  };
  visit(schema, "");
}

function schemaDiagnostics(schema: JsonSchema): {
  sha256: string;
  bytes: number;
  action_branches: number;
  definitions: number;
} {
  const serialized = JSON.stringify(schema);
  const definitions = isRecord(schema.$defs) ? schema.$defs : {};
  const action = isRecord(definitions.action) ? definitions.action : {};
  const branches = Array.isArray(action.anyOf) ? action.anyOf.length : 0;
  return {
    sha256: createHash("sha256").update(serialized).digest("hex"),
    bytes: Buffer.byteLength(serialized),
    action_branches: branches,
    definitions: Object.keys(definitions).length,
  };
}

function requireNonEmptyCollection(contentSchema: JsonSchema, field: string): void {
  const required = Array.isArray(contentSchema.required) ? contentSchema.required as string[] : [];
  if (!required.includes(field)) contentSchema.required = [...required, field];
  const properties = contentSchema.properties as JsonSchema | undefined;
  const collection = properties?.[field] as JsonSchema | undefined;
  if (collection?.type === "array") collection.minItems = 1;
}

/** Lower the generic Lesson Brief feature contract into this request's controlled-decoding schema.
 * This remains topic-agnostic: it only maps OLL capabilities to the collections that realize them. */
function buildAuthoringResponseJsonSchema(brief: LessonBrief, plan: AuthoringCapabilityPlan): JsonSchema {
  const schema = structuredClone(vertexResponseJsonSchema);
  const definitions = schema.$defs as JsonSchema | undefined;
  const action = definitions?.action as JsonSchema | undefined;
  const allVariants = Array.isArray(action?.anyOf) ? action.anyOf as JsonSchema[] : [];
  const writeContentByKind = new Map<string, JsonSchema>();
  for (const variant of allVariants) {
    const identity = actionVariantIdentity(variant);
    if (identity.action === "write" && identity.kind) {
      const content = (variant.properties as JsonSchema | undefined)?.content as JsonSchema | undefined;
      if (content) writeContentByKind.set(identity.kind, structuredClone(content));
    }
  }
  const allowedVariants = allVariants.filter((variant) => {
    const identity = actionVariantIdentity(variant);
    if (identity.action === "write") return !!identity.kind && plan.writeKinds.includes(identity.kind as AuthoringWriteKind);
    return !!identity.action
      && identity.action !== "connect"
      && plan.actions.includes(identity.action as AuthoringActionName);
  });
  const variants = allowedVariants.flatMap((variant) => {
    const identity = actionVariantIdentity(variant);
    if (identity.action !== "write" || !identity.kind
      || !visualSurfaces.includes(identity.kind as VisualSurface)) {
      return [variant];
    }
    const requirements = brief.visual_requirements.filter(
      (requirement) => requirement.surface === identity.kind,
    );
    if (requirements.length === 0) return [variant];
    return requirements.map((requirement) => {
      const exact = structuredClone(variant);
      const properties = exact.properties as JsonSchema;
      properties.as = { enum: [requirement.id] };
      return exact;
    });
  });
  if (action) action.anyOf = variants;

  const reviseVariant = variants.find((variant) => actionVariantIdentity(variant).action === "revise");
  if (reviseVariant) {
    const properties = reviseVariant.properties as JsonSchema;
    const revisionSchemas = plan.reviseKinds.map((kind) => {
      const content = writeContentByKind.get(kind);
      if (!content) throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", `No revise content Schema is available for '${kind}'`);
      return structuredClone(content);
    });
    properties.content = revisionSchemas.length === 1 ? revisionSchemas[0] : { anyOf: revisionSchemas };
  }
  if (brief.shared_variable_requirements.length > 0) {
    const animateIndex = variants.findIndex((variant) => actionVariantIdentity(variant).action === "animate");
    if (animateIndex < 0) {
      throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", "Shared variables require an animate action variant");
    }
    const animateTemplate = variants[animateIndex];
    const exactAnimateVariants = brief.shared_variable_requirements.map((requirement) => {
      const exact = structuredClone(animateTemplate);
      const properties = exact.properties as JsonSchema;
      properties.variable = { enum: [requirement.variable] };
      properties.value = { type: "number", enum: [requirement.animate_to] };
      properties.easing = { enum: [requirement.easing] };
      properties.duration_intent = { enum: [requirement.duration_intent] };
      const required = Array.isArray(exact.required) ? exact.required as string[] : [];
      exact.required = [...new Set([...required, "easing", "duration_intent"])];
      return exact;
    });
    variants.splice(animateIndex, 1, ...exactAnimateVariants);
  }

  const rootProperties = schema.properties as JsonSchema;
  const lesson = rootProperties.lesson as JsonSchema;
  const lessonProperties = lesson.properties as JsonSchema;
  // The planner has already fixed variable aliases, ranges, labels, and slider
  // settings. Do not ask the authoring model to copy those mechanical fields.
  // They are lowered into the candidate before full OLL validation.
  delete lessonProperties.variables;
  delete lessonProperties.tasks;
  if (Array.isArray(lesson.required)) {
    lesson.required = lesson.required.filter((field) => field !== "variables" && field !== "tasks");
  }

  const fieldsBySurface: Partial<Record<VisualSurface, Map<VisualFeature, string>>> = {
    geometry: new Map([
      ["circle", "circles"], ["origin_centered_circle", "circles"], ["unit_radius", "circles"],
      ["line_segments", "segments"],
      ["radius_segment", "segments"], ["projection_segment", "segments"], ["angle_arc", "arcs"],
    ]),
    plot: new Map([["annotated_points", "points"], ["guides", "guides"]]),
    scene3d: new Map([
      ["solid_primitives", "objects"],
      ["function_surface", "objects"],
      ["cross_section", "sections"],
      ["spatial_highlights", "highlights"],
    ]),
    diagram: new Map([["semantic_edges", "edges"]]),
  };
  for (const variant of variants) {
    const identity = actionVariantIdentity(variant);
    if (identity.action !== "write") continue;
    const properties = variant.properties as JsonSchema;
    const content = properties.content as JsonSchema;
    const contentProperties = content.properties as JsonSchema | undefined;
    const exactAliasSchema = properties.as as JsonSchema | undefined;
    const exactAlias = Array.isArray(exactAliasSchema?.enum)
      && typeof exactAliasSchema.enum[0] === "string"
      ? exactAliasSchema.enum[0]
      : undefined;
    const requirement = exactAlias
      ? brief.visual_requirements.find((candidate) => candidate.id === exactAlias)
      : undefined;
    const requiresBindings = exactAlias !== undefined
      && brief.shared_variable_requirements.some((variable) => variable.bound_visuals.includes(exactAlias));
    if (identity.kind === "geometry" || identity.kind === "plot" || identity.kind === "scene3d") {
      if (requiresBindings) {
        requireNonEmptyCollection(content, "bindings");
      } else {
        if (contentProperties) delete contentProperties.bindings;
        if (Array.isArray(content.required)) {
          content.required = content.required.filter((field) => field !== "bindings");
        }
      }
    }
    if (identity.kind === "geometry") {
      const points = contentProperties?.points as JsonSchema | undefined;
      const pointItems = points?.items as JsonSchema | undefined;
      const pointProperties = pointItems?.properties as JsonSchema | undefined;
      // Direct-manipulation metadata belongs to the deterministic lowering
      // step. The authoring model supplies the driven point and bindings.
      if (pointProperties) delete pointProperties.interaction;
    }
    if (requirement) {
      for (const feature of requirement.required_features) {
        const field = fieldsBySurface[requirement.surface]?.get(feature);
        if (field) requireNonEmptyCollection(content, field);
      }
    }
  }
  const projected = pruneUnusedDefinitions(schema);
  assertVertexSchemaCompatible(projected);
  return projected;
}

const visualSurfaces: VisualSurface[] = ["geometry", "plot", "scene3d", "diagram", "image", "table"];
const visualFeatures: VisualFeature[] = [
  "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
  "point_on_circle", "line_segments", "radius_segment", "projection_segment", "angle_arc", "function_curve",
  "annotated_points", "guides", "semantic_elements", "semantic_edges", "source_asset",
  "tabular_values",
  "spatial_axes", "solid_primitives", "function_surface", "cross_section", "spatial_highlights", "orbit_control",
];
const visualRelationships: VisualRelationshipRequirement["relation"][] = [
  "maps_to", "compares_with", "explains", "derives",
];
const animationEasings: SharedVariableRequirement["easing"][] = ["linear", "ease_in_out"];
const animationDurationIntents: SharedVariableRequirement["duration_intent"][] = [
  "brief", "normal", "extended",
];
const requestItemKinds: RequestItemKind[] = [
  "teaching_goal", "visual", "relationship", "continuous_change", "student_control", "student_task",
  "existing_board_edit", "presentation_constraint", "unsupported_feature",
];
const requestItemPolarities: RequestItemPolarity[] = ["require", "forbid"];
const unhandledStatuses: UnhandledRequestItem["status"][] = ["unsupported", "ambiguous"];
const idArraySchema: JsonSchema = { type: "array", minItems: 1, items: { type: "string" } };

const lessonBriefResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "request_summary", "request_items", "non_requirement_clauses", "teaching_goal_requirements",
    "presentation_constraints", "visual_requirements", "visual_relationships",
    "shared_variable_requirements", "student_task_requirements", "scene3d_task_requirements", "progressive_revision_kinds", "unhandled_request_items",
  ],
  properties: {
    version: { enum: ["1"] },
    request_summary: { type: "string" },
    request_items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source_ref", "kind", "polarity"],
        properties: {
          id: { type: "string" },
          source_ref: { type: "string" },
          kind: { enum: requestItemKinds },
          polarity: { enum: requestItemPolarities },
        },
      },
    },
    non_requirement_clauses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_ref", "reason"],
        properties: {
          source_ref: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    teaching_goal_requirements: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "goal", "request_item_ids"],
        properties: {
          id: { type: "string" },
          goal: { type: "string" },
          request_item_ids: idArraySchema,
        },
      },
    },
    presentation_constraints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "capability", "polarity", "request_item_ids"],
        properties: {
          id: { type: "string" },
          capability: { enum: presentationCapabilities },
          polarity: { enum: requestItemPolarities },
          request_item_ids: idArraySchema,
        },
      },
    },
    visual_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "surface", "purpose", "required_features", "expressions", "request_item_ids"],
        properties: {
          id: { type: "string" },
          surface: { enum: visualSurfaces },
          purpose: { type: "string" },
          required_features: { type: "array", items: { enum: visualFeatures } },
          expressions: { type: "array", items: { type: "string" } },
          request_item_ids: idArraySchema,
          motion_kind: { enum: ["linear_point", "angular_point", "planar_point"] },
          motion_subject: { type: "string" },
        },
      },
    },
    visual_relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "from", "to", "relation", "request_item_ids"],
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          relation: { enum: visualRelationships },
          request_item_ids: idArraySchema,
        },
      },
    },
    shared_variable_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "variable", "purpose", "initial", "min", "max", "label", "unit",
          "slider_step", "animate_to", "easing", "duration_intent", "bound_visuals",
          "direct_angle_geometry", "request_item_ids",
        ],
        properties: {
          id: { type: "string" },
          variable: { type: "string" },
          purpose: { type: "string" },
          initial: { type: "number" },
          min: { type: "number" },
          max: { type: "number" },
          label: { type: "string" },
          unit: { type: "string" },
          slider_step: { type: "number" },
          animate_to: { type: "number" },
          easing: { enum: animationEasings },
          duration_intent: { enum: animationDurationIntents },
          bound_visuals: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          direct_angle_geometry: { type: "string" },
          request_item_ids: idArraySchema,
        },
      },
    },
    student_task_requirements: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "prompt", "variable", "controls", "completion_expression",
          "completion_value", "tolerance", "hints", "hint_after_attempts",
          "success_message", "request_item_ids",
        ],
        properties: {
          id: { type: "string" },
          prompt: { type: "string" },
          variable: { type: "string" },
          controls: {
            type: "array",
            minItems: 1,
            items: { enum: ["slider", "geometry_point"] },
          },
          completion_expression: { type: "string" },
          completion_value: { type: "number" },
          tolerance: { type: "number" },
          hints: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" },
          },
          hint_after_attempts: { type: "integer" },
          success_message: { type: "string" },
          request_item_ids: idArraySchema,
        },
      },
    },
    scene3d_task_requirements: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "prompt", "visual", "controls", "target_yaw", "target_pitch",
          "target_zoom", "angular_tolerance", "zoom_tolerance", "hints",
          "hint_after_attempts", "success_message", "request_item_ids",
        ],
        properties: {
          id: { type: "string" },
          prompt: { type: "string" },
          visual: { type: "string" },
          controls: {
            type: "array",
            minItems: 1,
            items: { enum: ["orbit", "zoom", "preset", "reset"] },
          },
          target_yaw: { type: "number" },
          target_pitch: { type: "number" },
          target_zoom: { type: "number" },
          angular_tolerance: { type: "number" },
          zoom_tolerance: { type: "number" },
          hints: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" },
          },
          hint_after_attempts: { type: "integer" },
          success_message: { type: "string" },
          request_item_ids: idArraySchema,
        },
      },
    },
    progressive_revision_kinds: {
      type: "array",
      items: { enum: revisableNodeKinds },
    },
    unhandled_request_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request_item_id", "status", "reason"],
        properties: {
          request_item_id: { type: "string" },
          status: { enum: unhandledStatuses },
          reason: { type: "string" },
        },
      },
    },
  },
};

const briefVerificationResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["missing", "contradictions", "suggestions"],
  properties: {
    missing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_ref", "reason"],
        properties: {
          source_ref: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request_item_id", "reason"],
        properties: {
          request_item_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request_item_id", "suggestion"],
        properties: {
          request_item_id: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

const featuresBySurface: Record<VisualSurface, ReadonlySet<VisualFeature>> = {
  geometry: new Set([
    "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
    "point_on_circle", "line_segments", "radius_segment", "projection_segment", "angle_arc", "annotated_points",
  ]),
  plot: new Set(["coordinate_axes", "function_curve", "annotated_points", "guides"]),
  scene3d: new Set(["spatial_axes", "solid_primitives", "function_surface", "cross_section", "spatial_highlights", "orbit_control"]),
  diagram: new Set(["semantic_elements", "semantic_edges"]),
  image: new Set(["source_asset"]),
  table: new Set(["tabular_values"]),
};

interface VisualInventoryEntry {
  alias: string;
  surface: VisualSurface;
  features: Set<VisualFeature>;
  expressions: string[];
  content: Record<string, unknown>;
}

interface VisualConnection {
  from: string;
  to: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeEvidence(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\\$]/gu, "")
    .replace(/[（）()\[\]{}]/gu, "")
    .replace(/\s+/gu, "");
}

function authoritativeRequestSources(input: ToolInput): Array<{ source: RequestEvidenceSource; text: string }> {
  const sources: Array<{ source: RequestEvidenceSource; text: string }> = [
    { source: "learner_request", text: input.learner_request },
  ];
  if (input.request_source === "current_image" && input.source_observation) {
    sources.push({ source: "recognized_problem", text: input.source_observation.recognized_problem });
  }
  if (input.request_source === "explicit_board_follow_up" && input.board_summary) {
    sources.push({ source: "board_summary", text: input.board_summary });
  }
  return sources;
}

function splitAuthoritativeText(text: string): string[] {
  const clauses = text
    .split(/[。！？；!?;]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return clauses.length > 0 ? clauses : [text.trim()].filter(Boolean);
}

function authoritativeRequestClauses(input: ToolInput): AuthoritativeRequestClause[] {
  return authoritativeRequestSources(input).flatMap(({ source, text }) =>
    splitAuthoritativeText(text).map((clause, index) => ({
      ref: `${source}:${index + 1}`,
      source,
      text: clause,
    }))
  );
}

function buildLessonBriefResponseJsonSchema(input: ToolInput): JsonSchema {
  const schema = structuredClone(lessonBriefResponseJsonSchema);
  const properties = schema.properties as Record<string, JsonSchema>;
  const sourceRefs = authoritativeRequestClauses(input).map((clause) => clause.ref);
  const requestItems = properties.request_items;
  const itemProperties = (requestItems.items as JsonSchema).properties as Record<string, JsonSchema>;
  itemProperties.source_ref = { enum: sourceRefs };
  const nonRequirements = properties.non_requirement_clauses;
  const nonRequirementProperties = (nonRequirements.items as JsonSchema).properties as Record<string, JsonSchema>;
  nonRequirementProperties.source_ref = { enum: sourceRefs };
  return schema;
}

function buildBriefVerificationResponseJsonSchema(input: ToolInput, brief: LessonBrief): JsonSchema {
  const schema = structuredClone(briefVerificationResponseJsonSchema);
  const properties = schema.properties as Record<string, JsonSchema>;
  const missingProperties = ((properties.missing.items as JsonSchema).properties) as Record<string, JsonSchema>;
  missingProperties.source_ref = { enum: authoritativeRequestClauses(input).map((clause) => clause.ref) };
  const requestItemIds = brief.request_items.map((item) => item.id);
  const contradictionProperties = ((properties.contradictions.items as JsonSchema).properties) as Record<string, JsonSchema>;
  contradictionProperties.request_item_id = { enum: requestItemIds };
  const suggestionProperties = ((properties.suggestions.items as JsonSchema).properties) as Record<string, JsonSchema>;
  suggestionProperties.request_item_id = { enum: requestItemIds };
  return schema;
}

function briefViolation(code: string, path: string, message: string): GenerationViolation {
  return { stage: "brief", code, path, message };
}

function canonicalizeBriefAliases(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const brief = structuredClone(candidate);
  const alias = (value: unknown): unknown => typeof value === "string" ? value.replace(/_/gu, "-") : value;
  const aliasArray = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index += 1) value[index] = alias(value[index]);
  };
  const canonicalizeItems = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (!isRecord(item)) continue;
      item.id = alias(item.id);
      aliasArray(item.request_item_ids);
    }
  };
  canonicalizeItems(brief.request_items);
  canonicalizeItems(brief.teaching_goal_requirements);
  canonicalizeItems(brief.presentation_constraints);
  canonicalizeItems(brief.visual_requirements);
  canonicalizeItems(brief.visual_relationships);
  canonicalizeItems(brief.shared_variable_requirements);
  canonicalizeItems(brief.student_task_requirements);
  canonicalizeItems(brief.scene3d_task_requirements);
  if (Array.isArray(brief.visual_requirements)) {
    for (const requirement of brief.visual_requirements) {
      if (!isRecord(requirement) || !Array.isArray(requirement.expressions)) continue;
      requirement.expressions = requirement.expressions.map((expression) =>
        typeof expression === "string" ? canonicalPlotExpression(expression) : expression);
    }
  }
  if (Array.isArray(brief.visual_relationships)) {
    for (const relationship of brief.visual_relationships) {
      if (!isRecord(relationship)) continue;
      relationship.from = alias(relationship.from);
      relationship.to = alias(relationship.to);
    }
  }
  if (Array.isArray(brief.shared_variable_requirements)) {
    for (const requirement of brief.shared_variable_requirements) {
      if (!isRecord(requirement)) continue;
      aliasArray(requirement.bound_visuals);
      requirement.direct_angle_geometry = alias(requirement.direct_angle_geometry);
    }
  }
  if (Array.isArray(brief.scene3d_task_requirements)) {
    for (const requirement of brief.scene3d_task_requirements) {
      if (isRecord(requirement)) requirement.visual = alias(requirement.visual);
    }
  }
  if (Array.isArray(brief.unhandled_request_items)) {
    for (const item of brief.unhandled_request_items) {
      if (isRecord(item)) item.request_item_id = alias(item.request_item_id);
    }
  }
  return brief;
}

function validateLessonBrief(candidate: unknown, input: ToolInput): LessonBrief {
  const violations: GenerationViolation[] = [];
  if (!isRecord(candidate)) {
    throw new GeneratedLessonError("Lesson Brief must be a JSON object", undefined, [
      briefViolation("BRIEF_INVALID_ROOT", "/", "Lesson Brief must be a JSON object"),
    ]);
  }
  if (candidate.version !== "1") {
    violations.push(briefViolation("BRIEF_INVALID_VERSION", "/version", "version must be 1"));
  }
  if (typeof candidate.request_summary !== "string" || !candidate.request_summary.trim()) {
    violations.push(briefViolation("BRIEF_MISSING_SUMMARY", "/request_summary", "request_summary is required"));
  }
  const requestItems = Array.isArray(candidate.request_items) ? candidate.request_items : [];
  if (!Array.isArray(candidate.request_items) || candidate.request_items.length === 0) {
    violations.push(briefViolation("BRIEF_MISSING_REQUEST_ITEMS", "/request_items", "request_items must contain the explicit requirements from the authoritative request"));
  }
  const nonRequirementClauses = Array.isArray(candidate.non_requirement_clauses)
    ? candidate.non_requirement_clauses
    : [];
  if (!Array.isArray(candidate.non_requirement_clauses)) {
    violations.push(briefViolation(
      "BRIEF_INVALID_NON_REQUIREMENT_CLAUSES",
      "/non_requirement_clauses",
      "non_requirement_clauses must be an array",
    ));
  }
  const teachingGoals = Array.isArray(candidate.teaching_goal_requirements)
    ? candidate.teaching_goal_requirements
    : [];
  if (!Array.isArray(candidate.teaching_goal_requirements) || candidate.teaching_goal_requirements.length === 0) {
    violations.push(briefViolation("BRIEF_MISSING_TEACHING_GOALS", "/teaching_goal_requirements", "teaching_goal_requirements must contain at least one goal"));
  }
  const presentationConstraints = Array.isArray(candidate.presentation_constraints)
    ? candidate.presentation_constraints
    : [];
  if (!Array.isArray(candidate.presentation_constraints)) {
    violations.push(briefViolation("BRIEF_INVALID_PRESENTATION_CONSTRAINTS", "/presentation_constraints", "presentation_constraints must be an array"));
  }
  const requirements = Array.isArray(candidate.visual_requirements) ? candidate.visual_requirements : [];
  if (!Array.isArray(candidate.visual_requirements)) {
    violations.push(briefViolation("BRIEF_INVALID_REQUIREMENTS", "/visual_requirements", "visual_requirements must be an array"));
  }
  const relationships = Array.isArray(candidate.visual_relationships) ? candidate.visual_relationships : [];
  if (!Array.isArray(candidate.visual_relationships)) {
    violations.push(briefViolation("BRIEF_INVALID_RELATIONSHIPS", "/visual_relationships", "visual_relationships must be an array"));
  }
  const sharedVariables = Array.isArray(candidate.shared_variable_requirements)
    ? candidate.shared_variable_requirements
    : [];
  if (!Array.isArray(candidate.shared_variable_requirements)) {
    violations.push(briefViolation(
      "BRIEF_INVALID_SHARED_VARIABLES",
      "/shared_variable_requirements",
      "shared_variable_requirements must be an array",
    ));
  }
  const studentTasks = Array.isArray(candidate.student_task_requirements)
    ? candidate.student_task_requirements
    : [];
  if (!Array.isArray(candidate.student_task_requirements)) {
    violations.push(briefViolation(
      "BRIEF_INVALID_STUDENT_TASKS",
      "/student_task_requirements",
      "student_task_requirements must be an array",
    ));
  }
  const scene3dTasks = Array.isArray(candidate.scene3d_task_requirements)
    ? candidate.scene3d_task_requirements
    : [];
  if (!Array.isArray(candidate.scene3d_task_requirements)) {
    violations.push(briefViolation(
      "BRIEF_INVALID_SCENE3D_TASKS",
      "/scene3d_task_requirements",
      "scene3d_task_requirements must be an array",
    ));
  }
  const revisionKinds = Array.isArray(candidate.progressive_revision_kinds)
    ? candidate.progressive_revision_kinds
    : [];
  if (!Array.isArray(candidate.progressive_revision_kinds)
    || revisionKinds.some((kind) => !revisableNodeKinds.includes(kind as RevisableNodeKind))
    || new Set(revisionKinds).size !== revisionKinds.length) {
    violations.push(briefViolation("BRIEF_INVALID_REVISION_KINDS", "/progressive_revision_kinds", "progressive_revision_kinds must contain unique supported node kinds"));
  }
  const unhandledItems = Array.isArray(candidate.unhandled_request_items)
    ? candidate.unhandled_request_items
    : [];
  if (!Array.isArray(candidate.unhandled_request_items)) {
    violations.push(briefViolation("BRIEF_INVALID_UNHANDLED_ITEMS", "/unhandled_request_items", "unhandled_request_items must be an array"));
  }

  const authoritativeClauses = authoritativeRequestClauses(input);
  const authoritativeClauseByRef = new Map(authoritativeClauses.map((clause) => [clause.ref, clause] as const));
  const requestItemById = new Map<string, RequestItem>();
  requestItems.forEach((raw, index) => {
    const path = `/request_items/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUEST_ITEM", path, "request item must be an object"));
      return;
    }
    if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.id) || requestItemById.has(raw.id)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUEST_ITEM_ID", `${path}/id`, "request item id must be a unique lowercase alias"));
    }
    if (typeof raw.source_ref !== "string" || !authoritativeClauseByRef.has(raw.source_ref)) {
      violations.push(briefViolation("BRIEF_INVALID_SOURCE_REF", `${path}/source_ref`, "source_ref must reference one supplied authoritative request clause"));
    }
    if (!requestItemKinds.includes(raw.kind as RequestItemKind)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUEST_ITEM_KIND", `${path}/kind`, "request item kind is unsupported"));
    }
    if (!requestItemPolarities.includes(raw.polarity as RequestItemPolarity)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUEST_ITEM_POLARITY", `${path}/polarity`, "request item polarity is unsupported"));
    }
    if (typeof raw.id === "string" && /^[a-z][a-z0-9-]*$/.test(raw.id) && !requestItemById.has(raw.id)) {
      requestItemById.set(raw.id, raw as unknown as RequestItem);
    }
  });

  const requestSourceRefs = new Set(requestItems.flatMap((item) =>
    isRecord(item) && typeof item.source_ref === "string" ? [item.source_ref] : []));
  const nonRequirementSourceRefs = new Set<string>();
  nonRequirementClauses.forEach((raw, index) => {
    const path = `/non_requirement_clauses/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_NON_REQUIREMENT_CLAUSE", path, "non-requirement clause must be an object"));
      return;
    }
    if (typeof raw.source_ref !== "string" || !authoritativeClauseByRef.has(raw.source_ref)) {
      violations.push(briefViolation("BRIEF_INVALID_SOURCE_REF", `${path}/source_ref`, "source_ref must reference one supplied authoritative request clause"));
    } else if (nonRequirementSourceRefs.has(raw.source_ref)) {
      violations.push(briefViolation("BRIEF_DUPLICATE_SOURCE_DISPOSITION", `${path}/source_ref`, "source_ref may appear only once in non_requirement_clauses"));
    } else {
      nonRequirementSourceRefs.add(raw.source_ref);
      if (requestSourceRefs.has(raw.source_ref)) {
        violations.push(briefViolation("BRIEF_CONFLICTING_SOURCE_DISPOSITION", `${path}/source_ref`, "source_ref cannot be both a request item and a non-requirement clause"));
      }
    }
    if (typeof raw.reason !== "string" || !raw.reason.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_NON_REQUIREMENT_REASON", `${path}/reason`, "reason is required"));
    }
  });
  for (const clause of authoritativeClauses) {
    if (!requestSourceRefs.has(clause.ref) && !nonRequirementSourceRefs.has(clause.ref)) {
      violations.push(briefViolation(
        "BRIEF_SOURCE_CLAUSE_UNCLASSIFIED",
        "/request_items",
        `source clause '${clause.ref}' must be classified as a request item or a non-requirement clause`,
      ));
    }
  }

  const mappedDestinations = new Map<string, Set<string>>();
  const mapRequestItems = (
    rawIds: unknown,
    path: string,
    destination: string,
    expectedPolarity: RequestItemPolarity = "require",
  ): void => {
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      violations.push(briefViolation("BRIEF_MISSING_REQUEST_MAPPING", path, "request_item_ids must contain at least one request item id"));
      return;
    }
    const seen = new Set<string>();
    for (const id of rawIds) {
      const item = typeof id === "string" ? requestItemById.get(id) : undefined;
      if (!item || seen.has(String(id))) {
        violations.push(briefViolation("BRIEF_INVALID_REQUEST_MAPPING", path, "request_item_ids must reference unique existing request items"));
        continue;
      }
      seen.add(id as string);
      if (item.polarity !== expectedPolarity) {
        violations.push(briefViolation("BRIEF_INCOMPATIBLE_REQUEST_POLARITY", path, `${item.polarity} cannot be mapped to a ${expectedPolarity} ${destination}`));
      }
      const destinations = mappedDestinations.get(id as string) ?? new Set<string>();
      destinations.add(destination);
      mappedDestinations.set(id as string, destinations);
    }
  };

  const requirementIds = new Set<string>();
  const validateRequirementId = (value: unknown, path: string): void => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value) || requirementIds.has(value)) {
      violations.push(briefViolation("BRIEF_INVALID_ID", path, "requirement id must be a unique lowercase alias"));
    } else {
      requirementIds.add(value);
    }
  };

  teachingGoals.forEach((raw, index) => {
    const path = `/teaching_goal_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_TEACHING_GOAL", path, "teaching goal must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (typeof raw.goal !== "string" || !raw.goal.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_TEACHING_GOAL", `${path}/goal`, "goal must be a non-empty string"));
    }
    mapRequestItems(raw.request_item_ids, `${path}/request_item_ids`, "teaching_goal");
  });

  presentationConstraints.forEach((raw, index) => {
    const path = `/presentation_constraints/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_PRESENTATION_CONSTRAINT", path, "presentation constraint must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (!presentationCapabilities.includes(raw.capability as PresentationCapability)) {
      violations.push(briefViolation("BRIEF_INVALID_PRESENTATION_CAPABILITY", `${path}/capability`, "presentation capability is unsupported"));
    }
    if (!requestItemPolarities.includes(raw.polarity as RequestItemPolarity)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUEST_ITEM_POLARITY", `${path}/polarity`, "presentation constraint polarity is unsupported"));
    }
    mapRequestItems(
      raw.request_item_ids,
      `${path}/request_item_ids`,
      "presentation_constraint",
      raw.polarity as RequestItemPolarity,
    );
  });

  requirements.forEach((raw, index) => {
    const path = `/visual_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUIREMENT", path, "requirement must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (!visualSurfaces.includes(raw.surface as VisualSurface)) {
      violations.push(briefViolation("BRIEF_INVALID_SURFACE", `${path}/surface`, "surface is unsupported"));
    }
    if (typeof raw.purpose !== "string" || !raw.purpose.trim()) {
      violations.push(briefViolation("BRIEF_MISSING_PURPOSE", `${path}/purpose`, "purpose is required"));
    }
    mapRequestItems(raw.request_item_ids, `${path}/request_item_ids`, "visual");
    if (!Array.isArray(raw.required_features)) {
      violations.push(briefViolation("BRIEF_INVALID_FEATURES", `${path}/required_features`, "required_features must be an array"));
    } else if (visualSurfaces.includes(raw.surface as VisualSurface)) {
      for (const feature of raw.required_features) {
        if (!featuresBySurface[raw.surface as VisualSurface].has(feature as VisualFeature)) {
          violations.push(briefViolation("BRIEF_INCOMPATIBLE_FEATURE", `${path}/required_features`, `${String(feature)} is not supported by ${String(raw.surface)}`));
        }
      }
    }
    if (!Array.isArray(raw.expressions) || raw.expressions.some((value) => typeof value !== "string" || !value.trim())) {
      violations.push(briefViolation("BRIEF_INVALID_EXPRESSIONS", `${path}/expressions`, "expressions must contain only non-empty strings"));
    } else if (raw.expressions.length > 0 && raw.surface !== "plot" && raw.surface !== "scene3d") {
      violations.push(briefViolation("BRIEF_INCOMPATIBLE_EXPRESSIONS", `${path}/expressions`, "expressions are supported only by plot and scene3d requirements"));
    } else if (raw.surface === "plot" || raw.surface === "scene3d") {
      raw.expressions.forEach((expression, expressionIndex) => {
        try {
          compileMathExpression(expression as string, raw.surface === "scene3d" ? ["x", "y"] : ["x"]);
        } catch (error) {
          violations.push(briefViolation(
            raw.surface === "scene3d" ? "BRIEF_INVALID_SURFACE_EXPRESSION" : "BRIEF_INVALID_PLOT_EXPRESSION",
            `${path}/expressions/${expressionIndex}`,
            `expression must use the Runtime math syntax: ${(error as Error).message}`,
          ));
        }
      });
    }
    const hasMotionKind = raw.motion_kind !== undefined;
    const hasMotionSubject = raw.motion_subject !== undefined;
    if (hasMotionKind !== hasMotionSubject) {
      violations.push(briefViolation(
        "BRIEF_INCOMPLETE_VISUAL_MOTION",
        path,
        "motion_kind and motion_subject must be provided together",
      ));
    }
    if (hasMotionKind && !["linear_point", "angular_point", "planar_point"].includes(String(raw.motion_kind))) {
      violations.push(briefViolation("BRIEF_INVALID_VISUAL_MOTION", `${path}/motion_kind`, "motion_kind is unsupported"));
    }
    if (hasMotionSubject && (typeof raw.motion_subject !== "string" || !raw.motion_subject.trim())) {
      violations.push(briefViolation("BRIEF_INVALID_VISUAL_MOTION_SUBJECT", `${path}/motion_subject`, "motion_subject must visibly name the moving subject"));
    }
    if ((hasMotionKind || hasMotionSubject) && raw.surface !== "geometry") {
      violations.push(briefViolation("BRIEF_INCOMPATIBLE_VISUAL_MOTION", path, "visual motion metadata is supported only by geometry"));
    }
  });

  relationships.forEach((raw, index) => {
    const path = `/visual_relationships/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_RELATIONSHIP", path, "relationship must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    const visualIds = new Set(requirements.flatMap((item) => isRecord(item) && typeof item.id === "string" ? [item.id] : []));
    if (typeof raw.from !== "string" || !visualIds.has(raw.from)) {
      violations.push(briefViolation("BRIEF_UNKNOWN_RELATION_SOURCE", `${path}/from`, "from must reference a visual requirement id"));
    }
    if (typeof raw.to !== "string" || !visualIds.has(raw.to)) {
      violations.push(briefViolation("BRIEF_UNKNOWN_RELATION_TARGET", `${path}/to`, "to must reference a visual requirement id"));
    }
    if (typeof raw.from === "string" && raw.from === raw.to) {
      violations.push(briefViolation(
        "BRIEF_SELF_RELATIONSHIP",
        path,
        "relationship endpoints must reference two different visual requirements",
      ));
    }
    if (!visualRelationships.includes(raw.relation as VisualRelationshipRequirement["relation"])) {
      violations.push(briefViolation("BRIEF_INVALID_RELATION", `${path}/relation`, "relation is unsupported"));
    }
    mapRequestItems(raw.request_item_ids, `${path}/request_item_ids`, "relationship");
  });

  const visualById = new Map(requirements.flatMap((raw) => isRecord(raw) && typeof raw.id === "string"
    ? [[raw.id, raw] as const]
    : []));
  const variableNames = new Set<string>();
  sharedVariables.forEach((raw, index) => {
    const path = `/shared_variable_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_SHARED_VARIABLE", path, "shared variable requirement must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (typeof raw.variable !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(raw.variable)
      || variableNames.has(raw.variable)) {
      violations.push(briefViolation("BRIEF_INVALID_VARIABLE_NAME", `${path}/variable`, "variable must be a unique OLL variable alias"));
    } else {
      variableNames.add(raw.variable);
    }
    if (typeof raw.purpose !== "string" || !raw.purpose.trim()) {
      violations.push(briefViolation("BRIEF_MISSING_VARIABLE_PURPOSE", `${path}/purpose`, "purpose is required"));
    }
    mapRequestItems(
      raw.request_item_ids,
      `${path}/request_item_ids`,
      "shared_variable",
    );
    const min = numberValue(raw.min);
    const max = numberValue(raw.max);
    const initial = numberValue(raw.initial);
    const animateTo = numberValue(raw.animate_to);
    const sliderStep = numberValue(raw.slider_step);
    if (min === undefined || max === undefined || max <= min) {
      violations.push(briefViolation("BRIEF_INVALID_VARIABLE_RANGE", path, "min and max must define an increasing finite range"));
    } else {
      if (initial === undefined || initial < min || initial > max) {
        violations.push(briefViolation("BRIEF_INVALID_VARIABLE_INITIAL", `${path}/initial`, "initial must be inside the variable range"));
      }
      if (animateTo === undefined || animateTo < min || animateTo > max) {
        violations.push(briefViolation("BRIEF_INVALID_ANIMATION_TARGET", `${path}/animate_to`, "animate_to must be inside the variable range"));
      }
    }
    if (sliderStep === undefined || sliderStep <= 0) {
      violations.push(briefViolation("BRIEF_INVALID_SLIDER_STEP", `${path}/slider_step`, "slider_step must be positive"));
    }
    if (typeof raw.label !== "string" || !raw.label.trim()) {
      violations.push(briefViolation("BRIEF_MISSING_VARIABLE_LABEL", `${path}/label`, "label is required"));
    }
    if (typeof raw.unit !== "string") {
      violations.push(briefViolation("BRIEF_INVALID_VARIABLE_UNIT", `${path}/unit`, "unit must be a string"));
    }
    if (!animationEasings.includes(raw.easing as SharedVariableRequirement["easing"])) {
      violations.push(briefViolation("BRIEF_INVALID_ANIMATION_EASING", `${path}/easing`, "easing is unsupported"));
    }
    if (!animationDurationIntents.includes(raw.duration_intent as SharedVariableRequirement["duration_intent"])) {
      violations.push(briefViolation("BRIEF_INVALID_ANIMATION_DURATION", `${path}/duration_intent`, "duration_intent is unsupported"));
    }
    if (!Array.isArray(raw.bound_visuals) || raw.bound_visuals.length === 0) {
      violations.push(briefViolation("BRIEF_INVALID_BOUND_VISUALS", `${path}/bound_visuals`, "bound_visuals must contain at least one visual requirement id"));
    } else {
      const bound = new Set<string>();
      for (const visualId of raw.bound_visuals) {
        const visual = typeof visualId === "string" ? visualById.get(visualId) : undefined;
        if (!visual || bound.has(String(visualId))) {
          violations.push(briefViolation("BRIEF_INVALID_BOUND_VISUAL", `${path}/bound_visuals`, "bound_visuals must contain unique visual requirement ids"));
          continue;
        }
        bound.add(String(visualId));
        if (visual.surface !== "geometry" && visual.surface !== "plot" && visual.surface !== "scene3d") {
          violations.push(briefViolation(
            "BRIEF_UNSUPPORTED_BOUND_VISUAL",
            `${path}/bound_visuals`,
            "shared variables bind only geometry, plot, and scene3d visuals",
          ));
        } else if (visual.surface === "geometry") {
          if (!["linear_point", "angular_point", "planar_point"].includes(String(visual.motion_kind))) {
            violations.push(briefViolation(
              "BRIEF_MISSING_VISUAL_MOTION",
              `${path}/bound_visuals`,
              `bound geometry '${String(visualId)}' must declare linear_point, angular_point, or planar_point motion`,
            ));
          }
          if (typeof visual.motion_subject !== "string" || !visual.motion_subject.trim()) {
            violations.push(briefViolation(
              "BRIEF_MISSING_VISUAL_MOTION_SUBJECT",
              `${path}/bound_visuals`,
              `bound geometry '${String(visualId)}' must visibly name its moving subject`,
            ));
          }
        }
      }
    }
    if (typeof raw.direct_angle_geometry !== "string") {
      violations.push(briefViolation("BRIEF_INVALID_DIRECT_CONTROL", `${path}/direct_angle_geometry`, "direct_angle_geometry must be a string"));
    } else if (raw.direct_angle_geometry) {
      const directVisual = visualById.get(raw.direct_angle_geometry);
      if (!directVisual || directVisual.surface !== "geometry"
        || !Array.isArray(raw.bound_visuals) || !raw.bound_visuals.includes(raw.direct_angle_geometry)) {
        violations.push(briefViolation(
          "BRIEF_INVALID_DIRECT_CONTROL",
          `${path}/direct_angle_geometry`,
          "direct_angle_geometry must reference a bound geometry requirement",
        ));
      } else if (directVisual.motion_kind !== "angular_point") {
        violations.push(briefViolation(
          "BRIEF_INVALID_DIRECT_CONTROL_MOTION",
          `${path}/direct_angle_geometry`,
          "direct_angle_geometry must use angular_point motion",
        ));
      }
    }
  });

  const sharedVariableByName = new Map(sharedVariables.flatMap((raw) =>
    isRecord(raw) && typeof raw.variable === "string"
      ? [[raw.variable, raw] as const]
      : []));
  studentTasks.forEach((raw, index) => {
    const path = `/student_task_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK", path, "student task requirement must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (typeof raw.prompt !== "string" || !raw.prompt.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_PROMPT", `${path}/prompt`, "prompt must be a non-empty student instruction"));
    }
    const variable = typeof raw.variable === "string" ? sharedVariableByName.get(raw.variable) : undefined;
    if (!variable) {
      violations.push(briefViolation("BRIEF_UNKNOWN_STUDENT_TASK_VARIABLE", `${path}/variable`, "variable must reference one shared_variable_requirement.variable"));
    }
    const controls = Array.isArray(raw.controls) ? raw.controls : [];
    if (controls.length === 0
      || !controls.includes("slider")
      || controls.some((control) => control !== "slider" && control !== "geometry_point")
      || new Set(controls).size !== controls.length) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_CONTROLS", `${path}/controls`, "controls must include slider and contain only unique supported controls"));
    }
    if (controls.includes("geometry_point") && (!variable || !variable.direct_angle_geometry)) {
      violations.push(briefViolation("BRIEF_UNAVAILABLE_STUDENT_TASK_CONTROL", `${path}/controls`, "geometry_point requires the shared variable to declare direct_angle_geometry"));
    }
    if (typeof raw.completion_expression !== "string" || !raw.completion_expression.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_EXPRESSION", `${path}/completion_expression`, "completion_expression is required"));
    }
    const target = numberValue(raw.completion_value);
    const tolerance = numberValue(raw.tolerance);
    if (target === undefined) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_TARGET", `${path}/completion_value`, "completion_value must be finite"));
    }
    if (tolerance === undefined || tolerance <= 0) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_TOLERANCE", `${path}/tolerance`, "tolerance must be a positive finite number"));
    }
    if (variable && typeof raw.completion_expression === "string" && target !== undefined && tolerance !== undefined && tolerance > 0) {
      try {
        const evaluate = compileMathExpression(raw.completion_expression, [raw.variable as string]);
        const referenced = referencedMathVariables(raw.completion_expression, [raw.variable as string]);
        if (referenced.length !== 1 || referenced[0] !== raw.variable) {
          throw new Error("completion_expression must read the task variable");
        }
        const initial = numberValue(variable.initial);
        const min = numberValue(variable.min);
        const max = numberValue(variable.max);
        const sliderStep = numberValue(variable.slider_step);
        if (initial === undefined || min === undefined || max === undefined || sliderStep === undefined) {
          throw new Error("shared variable range is incomplete");
        }
        const initialResult = evaluate({ [raw.variable as string]: initial });
        if (Math.abs(initialResult - target) <= tolerance) {
          throw new Error("the task is already complete at the initial value");
        }
        let reachable = false;
        const check = (value: number): void => {
          if (reachable) return;
          const actual = evaluate({ [raw.variable as string]: value });
          if (Number.isFinite(actual) && Math.abs(actual - target) <= tolerance) {
            reachable = true;
          }
        };
        const exactSliderSteps = Math.floor((max - min) / sliderStep + 1e-12);
        if (exactSliderSteps > 20_000 && !controls.includes("geometry_point")) {
          throw new Error("task slider has too many discrete steps to verify reachability");
        }
        if (exactSliderSteps <= 20_000) {
          for (let sample = 0; sample <= exactSliderSteps && !reachable; sample += 1) {
            check(min + sample * sliderStep);
          }
        }
        if (!reachable && controls.includes("geometry_point")) {
          const sampleCount = 20_000;
          for (let sample = 0; sample <= sampleCount && !reachable; sample += 1) {
            check(min + (max - min) * sample / sampleCount);
          }
        }
        if (!reachable) throw new Error("no reachable value in the planned variable range satisfies the task");
      } catch (error) {
        violations.push(briefViolation(
          "BRIEF_INVALID_STUDENT_TASK_EXPRESSION",
          `${path}/completion_expression`,
          `completion condition is invalid: ${(error as Error).message}`,
        ));
      }
    }
    if (!Array.isArray(raw.hints) || raw.hints.length === 0 || raw.hints.length > 4
      || raw.hints.some((hint) => typeof hint !== "string" || !hint.trim())) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_HINTS", `${path}/hints`, "hints must contain one to four non-empty hints"));
    }
    if (!Number.isInteger(raw.hint_after_attempts)
      || (raw.hint_after_attempts as number) < 1
      || (raw.hint_after_attempts as number) > 20) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_HINT_THRESHOLD", `${path}/hint_after_attempts`, "hint_after_attempts must be an integer from 1 to 20"));
    }
    if (typeof raw.success_message !== "string" || !raw.success_message.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_STUDENT_TASK_SUCCESS", `${path}/success_message`, "success_message must be non-empty"));
    }
    mapRequestItems(raw.request_item_ids, `${path}/request_item_ids`, "student_task");
  });

  scene3dTasks.forEach((raw, index) => {
    const path = `/scene3d_task_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK", path, "scene3d task requirement must be an object"));
      return;
    }
    validateRequirementId(raw.id, `${path}/id`);
    if (typeof raw.prompt !== "string" || !raw.prompt.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_PROMPT", `${path}/prompt`, "prompt must be a non-empty student instruction"));
    }
    const visual = typeof raw.visual === "string" ? visualById.get(raw.visual) : undefined;
    if (!visual || visual.surface !== "scene3d"
      || !Array.isArray(visual.required_features)
      || !visual.required_features.includes("orbit_control")) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_VISUAL", `${path}/visual`, "visual must reference a scene3d requirement with orbit_control"));
    }
    const controls = Array.isArray(raw.controls) ? raw.controls : [];
    if (controls.length === 0
      || controls.some((control) => !["orbit", "zoom", "preset", "reset"].includes(String(control)))
      || new Set(controls).size !== controls.length) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_CONTROLS", `${path}/controls`, "controls must contain unique supported 3D view controls"));
    }
    const target = {
      yaw: numberValue(raw.target_yaw),
      pitch: numberValue(raw.target_pitch),
      zoom: numberValue(raw.target_zoom),
    };
    const angularTolerance = numberValue(raw.angular_tolerance);
    const zoomTolerance = numberValue(raw.zoom_tolerance);
    if (target.yaw === undefined || target.pitch === undefined || target.zoom === undefined
      || target.pitch < -Math.PI / 2 || target.pitch > Math.PI / 2
      || target.zoom < .2 || target.zoom > 5) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_TARGET", `${path}/target_yaw`, "target camera must be finite and inside the supported pitch/zoom range"));
    }
    if (angularTolerance === undefined || angularTolerance <= 0 || angularTolerance > Math.PI
      || zoomTolerance === undefined || zoomTolerance <= 0 || zoomTolerance > 4.8) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_TOLERANCE", `${path}/angular_tolerance`, "3D view tolerances must be positive and within the camera range"));
    }
    if (!Array.isArray(raw.hints) || raw.hints.length === 0 || raw.hints.length > 4
      || raw.hints.some((hint) => typeof hint !== "string" || !hint.trim())) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_HINTS", `${path}/hints`, "hints must contain one to four non-empty hints"));
    }
    if (!Number.isInteger(raw.hint_after_attempts)
      || (raw.hint_after_attempts as number) < 1
      || (raw.hint_after_attempts as number) > 20) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_HINT_THRESHOLD", `${path}/hint_after_attempts`, "hint_after_attempts must be an integer from 1 to 20"));
    }
    if (typeof raw.success_message !== "string" || !raw.success_message.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_SCENE3D_TASK_SUCCESS", `${path}/success_message`, "success_message must be non-empty"));
    }
    mapRequestItems(raw.request_item_ids, `${path}/request_item_ids`, "student_task");
  });

  const tasksForbidden = presentationConstraints.some((constraint) =>
    isRecord(constraint)
    && constraint.polarity === "forbid"
    && (constraint.capability === "student_task" || constraint.capability === "student_control"));
  if (tasksForbidden && (studentTasks.length > 0 || scene3dTasks.length > 0)) {
    violations.push(briefViolation("BRIEF_FORBIDDEN_STUDENT_TASK", "/student_task_requirements", "student tasks cannot be planned when the request forbids tasks or student control"));
  }
  if (!tasksForbidden && sharedVariables.length > 0 && studentTasks.length === 0) {
    violations.push(briefViolation("BRIEF_MISSING_STUDENT_TASK", "/student_task_requirements", "a lesson with a shared student-controllable variable must include at least one after-lesson task"));
  }

  const unhandledRequestIds = new Set<string>();
  unhandledItems.forEach((raw, index) => {
    const path = `/unhandled_request_items/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_UNHANDLED_ITEM", path, "unhandled request item must be an object"));
      return;
    }
    const item = typeof raw.request_item_id === "string" ? requestItemById.get(raw.request_item_id) : undefined;
    if (!item || unhandledRequestIds.has(String(raw.request_item_id))) {
      violations.push(briefViolation("BRIEF_INVALID_UNHANDLED_ITEM", `${path}/request_item_id`, "request_item_id must reference one unique request item"));
    } else {
      unhandledRequestIds.add(raw.request_item_id as string);
    }
    if (!unhandledStatuses.includes(raw.status as UnhandledRequestItem["status"])) {
      violations.push(briefViolation("BRIEF_INVALID_UNHANDLED_STATUS", `${path}/status`, "unhandled item status is unsupported"));
    }
    if (typeof raw.reason !== "string" || !raw.reason.trim()) {
      violations.push(briefViolation("BRIEF_INVALID_UNHANDLED_REASON", `${path}/reason`, "unhandled item reason is required"));
    }
  });

  const requiredDestinationByKind: Partial<Record<RequestItemKind, string>> = {
    teaching_goal: "teaching_goal",
    visual: "visual",
    relationship: "relationship",
    continuous_change: "shared_variable",
    student_task: "student_task",
    presentation_constraint: "presentation_constraint",
  };
  for (const [id, item] of requestItemById) {
    const destinations = mappedDestinations.get(id);
    const isUnhandled = unhandledRequestIds.has(id);
    if (isUnhandled && destinations?.size) {
      violations.push(briefViolation("BRIEF_CONFLICTING_REQUEST_COVERAGE", "/unhandled_request_items", `request item '${id}' is both planned and unhandled`));
    } else if (!isUnhandled && !destinations?.size) {
      violations.push(briefViolation("BRIEF_UNMAPPED_REQUEST_ITEM", "/request_items", `request item '${id}' has no planned or unhandled destination`));
    }
    const requiredDestination = requiredDestinationByKind[item.kind];
    if (!isUnhandled && requiredDestination && !destinations?.has(requiredDestination)) {
      violations.push(briefViolation(
        "BRIEF_INCOMPATIBLE_REQUEST_MAPPING",
        "/request_items",
        `request item '${id}' (${item.kind}) must map to at least one ${requiredDestination} requirement`,
      ));
    }
    if (!isUnhandled && item.kind === "student_control") {
      const mapsToScene3dView = requirements.some((raw) =>
        isRecord(raw)
        && raw.surface === "scene3d"
        && Array.isArray(raw.required_features)
        && raw.required_features.includes("orbit_control")
        && Array.isArray(raw.request_item_ids)
        && raw.request_item_ids.includes(id));
      if (!destinations?.has("shared_variable") && !mapsToScene3dView) {
        violations.push(briefViolation(
          "BRIEF_INCOMPATIBLE_REQUEST_MAPPING",
          "/request_items",
          `request item '${id}' (student_control) must map to a shared variable or a scene3d orbit_control requirement`,
        ));
      }
    }
    if ((item.kind === "existing_board_edit" || item.kind === "unsupported_feature") && !isUnhandled) {
      violations.push(briefViolation("BRIEF_UNSUPPORTED_ITEM_NOT_REPORTED", "/unhandled_request_items", `request item '${id}' must be reported as unsupported or ambiguous`));
    }
  }

  if (violations.length > 0) {
    throw new GeneratedLessonError(`Lesson Brief validation failed: ${formatViolations(violations)}`, undefined, violations);
  }
  return candidate as unknown as LessonBrief;
}

function validateBeatTeachingFocus(document: AuthoringLesson): void {
  document.steps.forEach((step, stepIndex) => {
    step.beats.forEach((beat, beatIndex) => {
      const hasTeachingFocus = beat.actions.some(
        (action) => action.do === "focus" && action.when === "after_speech",
      );
      if (hasTeachingFocus) return;
      const error = new Error(
        `Beat ${beat.key} must include an after_speech focus action for its current teaching target`,
      ) as Error & { code?: string; path?: string };
      error.code = "OLL_MISSING_BEAT_FOCUS";
      error.path = `/steps/${stepIndex}/beats/${beatIndex}/actions`;
      throw error;
    });
  });
}

function validateAnimationBeatTiming(document: AuthoringLesson): GenerationViolation[] {
  const violations: GenerationViolation[] = [];
  document.steps.forEach((step, stepIndex) => {
    step.beats.forEach((beat, beatIndex) => {
      const animations = beat.actions.filter((action) => action.do === "animate");
      if (animations.length === 0) return;
      const path = `/steps/${stepIndex}/beats/${beatIndex}`;
      if (animations.length !== 1) {
        violations.push({
          stage: "semantic",
          code: "OLL_ANIMATION_BEAT_MULTIPLE_ANIMATIONS",
          path: `${path}/actions`,
          message: "An animation Beat must contain exactly one animate action",
        });
      }
      const unrelated = beat.actions.filter(
        (action) => action.do !== "animate" && action.do !== "focus",
      );
      if (unrelated.length > 0) {
        violations.push({
          stage: "semantic",
          code: "OLL_ANIMATION_BEAT_NOT_ISOLATED",
          path: `${path}/actions`,
          message: `Move ${unrelated.map((action) => action.do).join(", ")} to a neighboring Beat; the animation Beat may contain only animate and after_speech focus`,
        });
      }
      for (const animation of animations) {
        if (animation.when && animation.when !== "during_speech") {
          violations.push({
            stage: "semantic",
            code: "OLL_ANIMATION_PHASE_INVALID",
            path: `${path}/actions`,
            message: "animate must run during_speech so Runtime can synchronize it with real narration playback",
          });
        }
      }
      const narration = beat.say.trim();
      const language = document.lesson.language.toLowerCase();
      const tooLong = language.startsWith("zh")
        ? Array.from(narration).length > 36
        : narration.split(/\s+/u).filter(Boolean).length > 22;
      const sentenceCount = narration.split(/[。！？!?]+/u).filter((part) => part.trim()).length;
      if (tooLong || sentenceCount > 2) {
        violations.push({
          stage: "semantic",
          code: "OLL_ANIMATION_BEAT_NARRATION_TOO_LONG",
          path: `${path}/say`,
          message: "Keep the animation Beat to one or two short observation sentences; move the full explanation to a neighboring Beat",
        });
      }
    });
  });
  return violations;
}

function formatViolations(violations: GenerationViolation[]): string {
  return violations.map((violation) => {
    const missingFeatures = violation.missing_features?.length
      ? ` missing_features=[${violation.missing_features.join(", ")}]`
      : "";
    const missingExpressions = violation.missing_expressions?.length
      ? ` missing_expressions=[${violation.missing_expressions.join(", ")}]`
      : "";
    return `${violation.code} at ${violation.path}: ${violation.message}${missingFeatures}${missingExpressions}`;
  }).join("; ");
}

function semanticViolation(error: unknown): GenerationViolation {
  const candidate = error as Error & { code?: string; path?: string };
  return {
    stage: "semantic",
    code: candidate.code || "OLL_SEMANTIC_VALIDATION_FAILED",
    path: candidate.path || "/",
    message: candidate.message || String(error),
  };
}

function validRange(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const min = Number(value.min);
  const max = Number(value.max);
  return Number.isFinite(min) && Number.isFinite(max) && max > min;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function referenceRoot(value: unknown): string {
  return typeof value === "string" ? value.split("#", 1)[0] : "";
}

function normalizeExpression(value: string): string {
  return canonicalPlotExpression(value).toLocaleLowerCase()
    .replace(/\s+/gu, "");
}

function canonicalPlotExpression(value: string): string {
  return value.normalize("NFKC")
    .trim()
    .replace(/^y\s*=\s*/iu, "")
    .replace(/\\(?:left|right)\b/gu, "")
    .replace(/\\(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|ln|log|floor|ceil|round)\s*\{/giu, "$1(")
    .replace(/\\(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|ln|log|floor|ceil|round)\b/giu, "$1")
    .replace(/\\pi\b/giu, "pi")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .trim();
}

function geometryInventory(alias: string, content: Record<string, unknown>): VisualInventoryEntry {
  const tolerance = 1e-3;
  const features = new Set<VisualFeature>();
  const axes = isRecord(content.axes) ? content.axes : undefined;
  if (axes && validRange(axes.x) && validRange(axes.y)) features.add("coordinate_axes");
  if (axes?.equal_scale === true) features.add("equal_scale");

  const points = Array.isArray(content.points) ? content.points.filter(isRecord) : [];
  const pointByAlias = new Map<string, { x: number; y: number }>();
  for (const point of points) {
    const x = numberValue(point.x);
    const y = numberValue(point.y);
    if (typeof point.as === "string" && x !== undefined && y !== undefined) {
      pointByAlias.set(point.as, { x, y });
      if (typeof point.label === "string" && point.label.trim()) features.add("annotated_points");
    }
  }

  const circles = Array.isArray(content.circles) ? content.circles.filter(isRecord) : [];
  const validCircles = circles.flatMap((circle) => {
    const center = typeof circle.center === "string" ? pointByAlias.get(circle.center) : undefined;
    const radius = numberValue(circle.radius);
    if (!center || radius === undefined || radius <= 0 || typeof circle.center !== "string") return [];
    return [{ centerAlias: circle.center, center, radius }];
  });
  if (validCircles.length > 0) features.add("circle");
  if (validCircles.some(({ center }) => Math.abs(center.x) <= tolerance && Math.abs(center.y) <= tolerance)) {
    features.add("origin_centered_circle");
  }
  if (validCircles.some(({ radius }) => Math.abs(radius - 1) <= tolerance)) features.add("unit_radius");

  const circlePoints = new Set<string>();
  for (const [pointAlias, point] of pointByAlias) {
    if (validCircles.some(({ centerAlias, center, radius }) => pointAlias !== centerAlias
      && Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius) <= tolerance)) {
      circlePoints.add(pointAlias);
    }
  }
  if (circlePoints.size > 0) features.add("point_on_circle");

  const segments = Array.isArray(content.segments) ? content.segments.filter(isRecord) : [];
  if (segments.some((segment) => typeof segment.from === "string"
    && typeof segment.to === "string"
    && pointByAlias.has(segment.from)
    && pointByAlias.has(segment.to)
    && segment.from !== segment.to)) {
    features.add("line_segments");
  }
  const hasRadius = segments.some((segment) => validCircles.some(({ centerAlias }) => {
    const endpoint = segment.from === centerAlias ? segment.to : segment.to === centerAlias ? segment.from : undefined;
    return typeof endpoint === "string" && circlePoints.has(endpoint);
  }));
  if (hasRadius) features.add("radius_segment");

  const hasProjection = segments.some((segment) => {
    if (segment.style !== "projection" || typeof segment.from !== "string" || typeof segment.to !== "string") return false;
    const from = pointByAlias.get(segment.from);
    const to = pointByAlias.get(segment.to);
    if (!from || !to) return false;
    const axisAligned = Math.abs(from.x - to.x) <= tolerance || Math.abs(from.y - to.y) <= tolerance;
    const touchesAxis = Math.abs(from.x) <= tolerance || Math.abs(from.y) <= tolerance
      || Math.abs(to.x) <= tolerance || Math.abs(to.y) <= tolerance;
    return axisAligned && touchesAxis;
  });
  if (hasProjection) features.add("projection_segment");

  const arcs = Array.isArray(content.arcs) ? content.arcs.filter(isRecord) : [];
  if (arcs.some((arc) => typeof arc.center === "string"
    && pointByAlias.has(arc.center)
    && (numberValue(arc.radius) ?? 0) > 0
    && numberValue(arc.start_angle) !== undefined
    && numberValue(arc.end_angle) !== undefined
    && Math.abs(Number(arc.end_angle) - Number(arc.start_angle)) > tolerance)) {
    features.add("angle_arc");
  }
  return { alias, surface: "geometry", features, expressions: [], content };
}

function inventoryWrite(action: Record<string, unknown>): VisualInventoryEntry | undefined {
  if (action.do !== "write" || typeof action.as !== "string" || !isRecord(action.content)) return undefined;
  const content = action.content;
  if (action.kind === "geometry") return geometryInventory(action.as, content);
  const features = new Set<VisualFeature>();
  if (action.kind === "plot") {
    const axes = isRecord(content.axes) ? content.axes : undefined;
    if (axes && validRange(axes.x) && validRange(axes.y)) features.add("coordinate_axes");
    const curves = Array.isArray(content.curves) ? content.curves.filter(isRecord) : [];
    const expressions = curves.flatMap((curve) => typeof curve.expression === "string" && curve.expression.trim()
      ? [curve.expression]
      : []);
    if (expressions.length > 0) features.add("function_curve");
    const points = Array.isArray(content.points) ? content.points.filter(isRecord) : [];
    if (points.some((point) => typeof point.label === "string" && point.label.trim())) features.add("annotated_points");
    if (Array.isArray(content.guides) && content.guides.length > 0) features.add("guides");
    return { alias: action.as, surface: "plot", features, expressions, content };
  }
  if (action.kind === "scene3d") {
    if (content.axes === true) features.add("spatial_axes");
    features.add("orbit_control");
    const objects = Array.isArray(content.objects) ? content.objects.filter(isRecord) : [];
    if (objects.some((object) => ["box", "sphere", "cylinder", "cone"].includes(String(object.kind)))) {
      features.add("solid_primitives");
    }
    const expressions = objects.flatMap((object) =>
      object.kind === "surface" && typeof object.expression === "string" && object.expression.trim()
        ? [object.expression]
        : []);
    if (expressions.length > 0) features.add("function_surface");
    if (Array.isArray(content.sections) && content.sections.length > 0) features.add("cross_section");
    if (Array.isArray(content.highlights) && content.highlights.length > 0) features.add("spatial_highlights");
    return { alias: action.as, surface: "scene3d", features, expressions, content };
  }
  if (action.kind === "diagram") {
    if (Array.isArray(content.elements) && content.elements.length > 0) features.add("semantic_elements");
    if (Array.isArray(content.edges) && content.edges.length > 0) features.add("semantic_edges");
    return { alias: action.as, surface: "diagram", features, expressions: [], content };
  }
  if (action.kind === "image") {
    if (typeof content.asset_id === "string" && content.asset_id.trim()) features.add("source_asset");
    return { alias: action.as, surface: "image", features, expressions: [], content };
  }
  if (action.kind === "table") {
    if (Array.isArray(content.columns) && content.columns.length > 0
      && Array.isArray(content.rows) && content.rows.length > 0) features.add("tabular_values");
    return { alias: action.as, surface: "table", features, expressions: [], content };
  }
  return undefined;
}

function buildVisualInventory(document: AuthoringLesson): {
  nodes: VisualInventoryEntry[];
  connections: VisualConnection[];
} {
  const nodes: VisualInventoryEntry[] = [];
  const connections: VisualConnection[] = [];
  for (const step of document.steps) {
    for (const beat of step.beats) {
      for (const rawAction of beat.actions as unknown[]) {
        if (!isRecord(rawAction)) continue;
        const node = inventoryWrite(rawAction);
        if (node) nodes.push(node);
        if (rawAction.do === "connect") {
          const from = referenceRoot(rawAction.from);
          const to = referenceRoot(rawAction.to);
          if (from && to) connections.push({ from, to });
        }
      }
    }
  }
  return { nodes, connections };
}

function allLessonActions(document: AuthoringLesson): Record<string, unknown>[] {
  return document.steps.flatMap((step) => step.beats.flatMap((beat) =>
    (beat.actions as unknown[]).filter(isRecord)));
}

function approximatelyEqual(left: unknown, right: number): boolean {
  const value = numberValue(left);
  return value !== undefined && Math.abs(value - right) <= 1e-8;
}

function expressionReferencesVariable(expression: unknown, variable: string): boolean {
  if (typeof expression !== "string") return false;
  const tokens = expression.match(/[a-z][a-z0-9_]*/giu) ?? [];
  return tokens.some((token) => token.toLocaleLowerCase() === variable.toLocaleLowerCase());
}

function geometryMotionSatisfied(
  content: Record<string, unknown>,
  requirement: VisualRequirement,
  variable: string,
): boolean {
  if (!requirement.motion_kind || !requirement.motion_subject) return true;
  const subject = normalizeEvidence(requirement.motion_subject);
  const points = Array.isArray(content.points) ? content.points.filter(isRecord) : [];
  const pointByAlias = new Map(points.flatMap((point) =>
    typeof point.as === "string" ? [[point.as, point] as const] : []));
  const bindings = Array.isArray(content.bindings) ? content.bindings.filter(isRecord) : [];
  const boundCoordinates = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (typeof binding.target !== "string"
      || !expressionReferencesVariable(binding.expression, variable)) continue;
    const separator = binding.target.lastIndexOf(".");
    if (separator <= 0) continue;
    const alias = binding.target.slice(0, separator);
    const property = binding.target.slice(separator + 1);
    if (!pointByAlias.has(alias) || (property !== "x" && property !== "y")) continue;
    const coordinates = boundCoordinates.get(alias) ?? new Set<string>();
    coordinates.add(property);
    boundCoordinates.set(alias, coordinates);
  }
  const segments = Array.isArray(content.segments) ? content.segments.filter(isRecord) : [];
  return points.some((point) => {
    if (typeof point.as !== "string" || typeof point.label !== "string") return false;
    const label = normalizeEvidence(point.label);
    if (!label.includes(subject)) return false;
    const coordinates = boundCoordinates.get(point.as) ?? new Set<string>();
    if (requirement.motion_kind === "linear_point") return coordinates.size === 1;
    if (!coordinates.has("x") || !coordinates.has("y")) return false;
    if (requirement.motion_kind === "planar_point") return true;
    const interaction = isRecord(point.interaction) ? point.interaction : undefined;
    const hasCenterConnection = segments.some((segment) =>
      (segment.from === point.as && typeof segment.to === "string" && pointByAlias.has(segment.to))
      || (segment.to === point.as && typeof segment.from === "string" && pointByAlias.has(segment.from)));
    return interaction?.kind === "angle_control" || hasCenterConnection;
  });
}

/** Insert fields that were already fixed by the validated request plan.
 * The authoring model still chooses teaching beats, board nodes, bindings, and
 * placement. This lowering step only copies plan-owned metadata and adds a
 * direct manipulation marker when the generated geometry identifies exactly
 * one variable-driven point and one matching circle center. */
function lowerPlannedLessonFields(document: unknown, brief: LessonBrief): unknown {
  if (!isRecord(document) || !isRecord(document.lesson)) return document;

  document.lesson.goals = brief.teaching_goal_requirements.map((requirement) => requirement.goal);
  if (brief.shared_variable_requirements.length === 0) delete document.lesson.variables;
  else {
    document.lesson.variables = brief.shared_variable_requirements.map((requirement) => ({
      as: requirement.variable,
      initial: requirement.initial,
      min: requirement.min,
      max: requirement.max,
      label: requirement.label,
      unit: requirement.unit,
      control: { kind: "slider", step: requirement.slider_step },
    }));
  }
  if (brief.student_task_requirements.length === 0
    && brief.scene3d_task_requirements.length === 0) delete document.lesson.tasks;
  else {
    const variableTasks = brief.student_task_requirements.map((requirement) => ({
      as: requirement.id,
      prompt: requirement.prompt,
      availability: { kind: "after_lesson" },
      allowed_operations: [{
        kind: "variable_change",
        variable: requirement.variable,
        controls: [...requirement.controls],
      }],
      completion: {
        kind: "expression_target",
        expression: requirement.completion_expression,
        value: requirement.completion_value,
        tolerance: requirement.tolerance,
      },
      hints: [...requirement.hints],
      hint_after_attempts: requirement.hint_after_attempts,
      success_message: requirement.success_message,
    }));
    const scene3dTasks = brief.scene3d_task_requirements.map((requirement) => ({
      as: requirement.id,
      prompt: requirement.prompt,
      availability: { kind: "after_lesson" },
      allowed_operations: [{
        kind: "scene3d_view",
        node: requirement.visual,
        controls: [...requirement.controls],
      }],
      completion: {
        kind: "scene3d_view_target",
        node: requirement.visual,
        yaw: requirement.target_yaw,
        pitch: requirement.target_pitch,
        zoom: requirement.target_zoom,
        angular_tolerance: requirement.angular_tolerance,
        zoom_tolerance: requirement.zoom_tolerance,
      },
      hints: [...requirement.hints],
      hint_after_attempts: requirement.hint_after_attempts,
      success_message: requirement.success_message,
    }));
    document.lesson.tasks = [...variableTasks, ...scene3dTasks];
  }

  const rawBeats: Record<string, unknown>[] = [];
  const writeBeatByAlias = new Map<string, { beat: Record<string, unknown>; order: number }>();
  let beatOrder = 0;
  if (Array.isArray(document.steps)) {
    for (const step of document.steps) {
      if (!isRecord(step) || !Array.isArray(step.beats)) continue;
      for (const beat of step.beats) {
        if (!isRecord(beat) || !Array.isArray(beat.actions)) continue;
        // Connections implement the validated visual plan and are therefore
        // compiler-owned. Ignore model-authored connections instead of trying
        // to reconcile two competing identities.
        beat.actions = beat.actions.filter((action) => !isRecord(action) || action.do !== "connect");
        rawBeats.push(beat);
        for (const action of beat.actions) {
          if (isRecord(action) && action.do === "write" && typeof action.as === "string") {
            writeBeatByAlias.set(action.as, { beat, order: beatOrder });
          }
        }
        beatOrder += 1;
      }
    }
  }
  for (const relationship of brief.visual_relationships) {
    const from = writeBeatByAlias.get(relationship.from);
    const to = writeBeatByAlias.get(relationship.to);
    if (!from || !to) continue;
    const targetBeat = from.order > to.order ? from.beat : to.beat;
    const actions = targetBeat.actions as unknown[];
    const focusIndex = actions.findIndex((action) => isRecord(action) && action.do === "focus");
    actions.splice(focusIndex >= 0 ? focusIndex : actions.length, 0, {
      do: "connect",
      as: relationship.id,
      from: relationship.from,
      to: relationship.to,
      relation: relationship.relation,
    });
  }

  const rawActions: Record<string, unknown>[] = [];
  for (const beat of rawBeats) rawActions.push(...(beat.actions as unknown[]).filter(isRecord));

  const animateActions = rawActions.filter((action) => action.do === "animate");
  for (const requirement of brief.shared_variable_requirements) {
    let matches = animateActions.filter((action) => action.variable === requirement.variable);
    if (matches.length === 0
      && animateActions.length === 1
      && brief.shared_variable_requirements.length === 1) {
      matches = animateActions;
    }
    if (matches.length !== 1) continue;
    const [animation] = matches;
    animation.variable = requirement.variable;
    animation.value = requirement.animate_to;
    animation.easing = requirement.easing;
    animation.duration_intent = requirement.duration_intent;
  }

  for (const variable of brief.shared_variable_requirements) {
    if (!variable.direct_angle_geometry) continue;
    const visualRequirement = brief.visual_requirements.find(
      (requirement) => requirement.id === variable.direct_angle_geometry && requirement.surface === "geometry",
    );
    if (!visualRequirement) continue;
    const geometryCandidates = rawActions.flatMap((action) => {
      if (action.do !== "write" || action.as !== visualRequirement.id) return [];
      const inventory = inventoryWrite(action);
      return inventory?.surface === "geometry" ? [{ action, inventory }] : [];
    });
    if (geometryCandidates.length !== 1) continue;

    const content = geometryCandidates[0].inventory.content;
    const points = Array.isArray(content.points) ? content.points.filter(isRecord) : [];
    const pointByAlias = new Map(points.flatMap((point) =>
      typeof point.as === "string" ? [[point.as, point] as const] : []));
    const bindings = Array.isArray(content.bindings) ? content.bindings.filter(isRecord) : [];
    const drivenCoordinates = new Map<string, Set<string>>();
    for (const binding of bindings) {
      if (typeof binding.target !== "string"
        || !expressionReferencesVariable(binding.expression, variable.variable)) continue;
      const separator = binding.target.lastIndexOf(".");
      if (separator <= 0) continue;
      const alias = binding.target.slice(0, separator);
      const property = binding.target.slice(separator + 1);
      if (property !== "x" && property !== "y") continue;
      const coordinates = drivenCoordinates.get(alias) ?? new Set<string>();
      coordinates.add(property);
      drivenCoordinates.set(alias, coordinates);
    }
    const drivenPoints = [...drivenCoordinates]
      .filter(([, coordinates]) => coordinates.has("x") && coordinates.has("y"))
      .flatMap(([alias]) => pointByAlias.has(alias) ? [{ alias, point: pointByAlias.get(alias) as Record<string, unknown> }] : []);

    const circles = Array.isArray(content.circles) ? content.circles.filter(isRecord) : [];
    const segments = Array.isArray(content.segments) ? content.segments.filter(isRecord) : [];
    const tolerance = 1e-3;
    const pairs = new Map<string, { point: Record<string, unknown>; center: string; radius: number }>();
    for (const { alias, point } of drivenPoints) {
      const pointX = numberValue(point.x);
      const pointY = numberValue(point.y);
      for (const circle of circles) {
        if (typeof circle.center !== "string") continue;
        const center = pointByAlias.get(circle.center);
        const centerX = numberValue(center?.x);
        const centerY = numberValue(center?.y);
        const radius = numberValue(circle.radius);
        if (!center || centerX === undefined || centerY === undefined || radius === undefined || radius <= 0) continue;
        const liesOnCircle = pointX !== undefined && pointY !== undefined
          && Math.abs(Math.hypot(pointX - centerX, pointY - centerY) - radius) <= tolerance;
        const hasRadiusSegment = segments.some((segment) =>
          (segment.from === circle.center && segment.to === alias)
          || (segment.to === circle.center && segment.from === alias));
        if (!liesOnCircle && !hasRadiusSegment) continue;
        pairs.set(`${alias}\u0000${circle.center}`, { point, center: circle.center, radius });
      }
    }
    if (pairs.size !== 1) continue;
    const [{ point, center, radius }] = [...pairs.values()];
    point.interaction = {
      kind: "angle_control",
      variable: variable.variable,
      center,
    };
    if (visualRequirement.required_features.includes("angle_arc")) {
      const arcs = Array.isArray(content.arcs) ? content.arcs.filter(isRecord) : [];
      const existingArcAliases = new Set(arcs.flatMap((candidate) =>
        typeof candidate.as === "string" ? [candidate.as] : []));
      for (let index = bindings.length - 1; index >= 0; index -= 1) {
        const target = bindings[index].target;
        if (typeof target !== "string" || !target.endsWith(".end_angle")) continue;
        const alias = target.slice(0, -".end_angle".length);
        if (!existingArcAliases.has(alias)) bindings.splice(index, 1);
      }
      const delta = Math.max(variable.slider_step, 0.05);
      const seededEnd = variable.initial + delta <= variable.max
        ? variable.initial + delta
        : variable.initial - delta;
      let arc = arcs.find((candidate) => candidate.center === center && (numberValue(candidate.radius) ?? 0) > 0);
      if (!arc) {
        const usedAliases = new Set<string>();
        for (const field of ["points", "circles", "segments", "arcs"] as const) {
          const items = Array.isArray(content[field]) ? content[field].filter(isRecord) : [];
          for (const item of items) if (typeof item.as === "string") usedAliases.add(item.as);
        }
        const baseAlias = `${variable.variable}-angle`;
        let alias = baseAlias;
        let suffix = 2;
        while (usedAliases.has(alias)) alias = `${baseAlias}-${suffix++}`;
        arc = {
          as: alias,
          center,
          radius: Math.max(radius * 0.28, 0.05),
          start_angle: 0,
          end_angle: seededEnd,
          label: variable.label,
        };
        arcs.push(arc);
        content.arcs = arcs;
      } else {
        arc.start_angle = 0;
        arc.end_angle = seededEnd;
      }
      if (typeof arc.as === "string") {
        const target = `${arc.as}.end_angle`;
        if (!bindings.some((binding) => binding.target === target)) {
          bindings.push({ target, expression: variable.variable });
        }
      }
      content.bindings = bindings;
    }
  }
  return document;
}

function validateBriefCoverage(document: AuthoringLesson, brief: LessonBrief): GenerationViolation[] {
  const inventory = buildVisualInventory(document);
  const matched = new Map<string, VisualInventoryEntry>();
  const violations: GenerationViolation[] = [];
  const lessonGoals = document.lesson.goals.map((goal) => normalizeEvidence(goal));
  for (const [index, requirement] of brief.teaching_goal_requirements.entries()) {
    const expected = normalizeEvidence(requirement.goal);
    if (!lessonGoals.some((goal) => goal.includes(expected) || expected.includes(goal))) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_TEACHING_GOAL_UNSATISFIED",
        path: `/lesson/goals/${index}`,
        requirement_id: requirement.id,
        message: `Teaching goal '${requirement.goal}' must be represented in lesson.goals`,
      });
    }
  }
  for (const requirement of brief.visual_requirements) {
    const node = inventory.nodes.find((candidate) => candidate.alias === requirement.id);
    if (!node) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_VISUAL_OBJECT_MISSING",
        path: "/steps",
        requirement_id: requirement.id,
        message: `Planned visual object '${requirement.id}' must be created with write.as='${requirement.id}'`,
        missing_features: requirement.required_features,
        missing_expressions: requirement.expressions,
      });
      continue;
    }
    const missingFeatures = node.surface === requirement.surface
      ? requirement.required_features.filter((feature) => !node.features.has(feature))
      : requirement.required_features;
    const actualExpressions = node.expressions.map(normalizeExpression);
    const missingExpressions = requirement.expressions.filter(
      (expression) => !actualExpressions.includes(normalizeExpression(expression)),
    );
    const motionVariable = brief.shared_variable_requirements.find((variable) =>
      variable.bound_visuals.includes(requirement.id));
    const motionSatisfied = node.surface !== "geometry"
      || !motionVariable
      || geometryMotionSatisfied(node.content, requirement, motionVariable.variable);
    if (node.surface === requirement.surface
      && missingFeatures.length === 0
      && missingExpressions.length === 0
      && motionSatisfied) {
      matched.set(requirement.id, node);
      continue;
    }
    if (node.surface !== requirement.surface
      || missingFeatures.length > 0
      || missingExpressions.length > 0) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_VISUAL_REQUIREMENT_UNSATISFIED",
        path: "/steps",
        requirement_id: requirement.id,
        message: `Planned visual object '${requirement.id}' must be a complete ${requirement.surface} node`,
        missing_features: missingFeatures,
        missing_expressions: missingExpressions,
      });
    }
    if (!motionSatisfied) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_VISUAL_MOTION_UNSATISFIED",
        path: "/steps",
        requirement_id: requirement.id,
        message: `Visual '${requirement.id}' must show '${requirement.motion_subject}' with ${requirement.motion_kind} motion driven by '${motionVariable?.variable}'`,
      });
    }
  }
  for (const [index, relationship] of brief.visual_relationships.entries()) {
    const from = matched.get(relationship.from);
    const to = matched.get(relationship.to);
    if (!from || !to) continue;
    const connected = inventory.connections.some((connection) => {
      if (relationship.relation === "compares_with") {
        return (connection.from === from.alias && connection.to === to.alias)
          || (connection.from === to.alias && connection.to === from.alias);
      }
      return connection.from === from.alias && connection.to === to.alias;
    });
    if (!connected) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_VISUAL_RELATIONSHIP_UNSATISFIED",
        path: `/visual_relationships/${index}`,
        message: `Required ${relationship.relation} relationship from '${from.alias}' to '${to.alias}' needs an actual connect action`,
        requirement_id: `${relationship.from}->${relationship.to}`,
      });
    }
  }
  const actions = allLessonActions(document);
  const lesson = document.lesson as unknown as Record<string, unknown>;
  const declarations = Array.isArray(lesson.variables) ? lesson.variables.filter(isRecord) : [];
  for (const [index, requirement] of brief.shared_variable_requirements.entries()) {
    const declaration = declarations.find((candidate) => candidate.as === requirement.variable);
    const control = declaration && isRecord(declaration.control) ? declaration.control : undefined;
    const declarationMatches = declaration
      && approximatelyEqual(declaration.initial, requirement.initial)
      && approximatelyEqual(declaration.min, requirement.min)
      && approximatelyEqual(declaration.max, requirement.max)
      && declaration.label === requirement.label
      && declaration.unit === requirement.unit
      && control?.kind === "slider"
      && approximatelyEqual(control.step, requirement.slider_step);
    if (!declarationMatches) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_SHARED_VARIABLE_DECLARATION_UNSATISFIED",
        path: "/lesson/variables",
        requirement_id: requirement.id,
        message: `Shared variable '${requirement.variable}' must be declared once with the planned range, label, unit, and slider`,
      });
    }

    for (const visualId of requirement.bound_visuals) {
      const visual = matched.get(visualId);
      if (!visual) continue;
      const bindings = Array.isArray(visual.content.bindings)
        ? visual.content.bindings.filter(isRecord)
        : [];
      if (!bindings.some((binding) => typeof binding.target === "string"
        && expressionReferencesVariable(binding.expression, requirement.variable))) {
        violations.push({
          stage: "request_coverage",
          code: "OLL_SHARED_VARIABLE_BINDING_UNSATISFIED",
          path: "/steps",
          requirement_id: requirement.id,
          message: `Visual '${visual.alias}' must contain a numeric binding that references shared variable '${requirement.variable}'`,
        });
      }
    }

    const animation = actions.find((action) => action.do === "animate"
      && action.variable === requirement.variable
      && approximatelyEqual(action.value, requirement.animate_to)
      && action.easing === requirement.easing
      && action.duration_intent === requirement.duration_intent);
    if (!animation) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_SHARED_VARIABLE_ANIMATION_UNSATISFIED",
        path: "/steps",
        requirement_id: requirement.id,
        message: `Shared variable '${requirement.variable}' needs the planned animate action`,
      });
    }

    if (requirement.direct_angle_geometry) {
      const geometry = matched.get(requirement.direct_angle_geometry);
      const points = geometry && Array.isArray(geometry.content.points)
        ? geometry.content.points.filter(isRecord)
        : [];
      const hasDirectControl = points.some((point) => isRecord(point.interaction)
        && point.interaction.kind === "angle_control"
        && point.interaction.variable === requirement.variable
        && typeof point.interaction.center === "string");
      if (!hasDirectControl) {
        violations.push({
          stage: "request_coverage",
          code: "OLL_SHARED_VARIABLE_DIRECT_CONTROL_UNSATISFIED",
          path: "/steps",
          requirement_id: requirement.id,
          message: `Geometry '${geometry?.alias ?? requirement.direct_angle_geometry}' needs an angle_control point for shared variable '${requirement.variable}'`,
        });
      }
    }
  }
  const tasks = Array.isArray(lesson.tasks) ? lesson.tasks.filter(isRecord) : [];
  for (const [index, requirement] of brief.student_task_requirements.entries()) {
    const task = tasks.find((candidate) => candidate.as === requirement.id);
    const availability = task && isRecord(task.availability) ? task.availability : undefined;
    const allowedOperations = task && Array.isArray(task.allowed_operations)
      ? task.allowed_operations.filter(isRecord)
      : [];
    const allowed = allowedOperations.find((operation) =>
      operation.kind === "variable_change" && operation.variable === requirement.variable);
    const controls = allowed && Array.isArray(allowed.controls) ? allowed.controls : [];
    const completion = task && isRecord(task.completion) ? task.completion : undefined;
    const taskMatches = task
      && task.prompt === requirement.prompt
      && availability?.kind === "after_lesson"
      && allowedOperations.length === 1
      && controls.length === requirement.controls.length
      && requirement.controls.every((control) => controls.includes(control))
      && completion?.kind === "expression_target"
      && completion.expression === requirement.completion_expression
      && approximatelyEqual(completion.value, requirement.completion_value)
      && approximatelyEqual(completion.tolerance, requirement.tolerance)
      && Array.isArray(task.hints)
      && task.hints.length === requirement.hints.length
      && requirement.hints.every((hint, hintIndex) => task.hints?.[hintIndex] === hint)
      && task.hint_after_attempts === requirement.hint_after_attempts
      && task.success_message === requirement.success_message;
    if (!taskMatches) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_STUDENT_TASK_UNSATISFIED",
        path: `/lesson/tasks/${index}`,
        requirement_id: requirement.id,
        message: `Student task '${requirement.id}' must preserve the planned prompt, controls, completion condition, hints, and feedback`,
      });
    }
  }
  for (const [index, requirement] of brief.scene3d_task_requirements.entries()) {
    const task = tasks.find((candidate) => candidate.as === requirement.id);
    const availability = task && isRecord(task.availability) ? task.availability : undefined;
    const allowedOperations = task && Array.isArray(task.allowed_operations)
      ? task.allowed_operations.filter(isRecord)
      : [];
    const allowed = allowedOperations.find((operation) =>
      operation.kind === "scene3d_view" && operation.node === requirement.visual);
    const controls = allowed && Array.isArray(allowed.controls) ? allowed.controls : [];
    const completion = task && isRecord(task.completion) ? task.completion : undefined;
    const taskMatches = task
      && task.prompt === requirement.prompt
      && availability?.kind === "after_lesson"
      && allowedOperations.length === 1
      && controls.length === requirement.controls.length
      && requirement.controls.every((control) => controls.includes(control))
      && completion?.kind === "scene3d_view_target"
      && completion.node === requirement.visual
      && approximatelyEqual(completion.yaw, requirement.target_yaw)
      && approximatelyEqual(completion.pitch, requirement.target_pitch)
      && approximatelyEqual(completion.zoom, requirement.target_zoom)
      && approximatelyEqual(completion.angular_tolerance, requirement.angular_tolerance)
      && approximatelyEqual(completion.zoom_tolerance, requirement.zoom_tolerance)
      && Array.isArray(task.hints)
      && task.hints.length === requirement.hints.length
      && requirement.hints.every((hint, hintIndex) => task.hints?.[hintIndex] === hint)
      && task.hint_after_attempts === requirement.hint_after_attempts
      && task.success_message === requirement.success_message;
    if (!taskMatches) {
      violations.push({
        stage: "request_coverage",
        code: "OLL_SCENE3D_TASK_UNSATISFIED",
        path: `/lesson/tasks/${brief.student_task_requirements.length + index}`,
        requirement_id: requirement.id,
        message: `3D student task '${requirement.id}' must preserve its scene, controls, target view, tolerances, hints, and feedback`,
      });
    }
  }
  return violations;
}

function reviseContentMatchesKind(content: Record<string, unknown>, kind: RevisableNodeKind): boolean {
  if (kind === "text" || kind === "shape") return typeof content.text === "string" && content.text.trim().length > 0;
  if (kind === "math") return typeof content.latex === "string" && content.latex.trim().length > 0;
  if (kind === "note") {
    return typeof content.title === "string" && content.title.trim().length > 0
      && Array.isArray(content.items);
  }
  if (kind === "table") return Array.isArray(content.columns) && Array.isArray(content.rows);
  if (kind === "diagram") return Array.isArray(content.elements);
  return false;
}

function validateAllowedCapabilities(
  document: AuthoringLesson,
  plan: AuthoringCapabilityPlan,
): GenerationViolation[] {
  const violations: GenerationViolation[] = [];
  const nodeKindByAlias = new Map<string, AuthoringWriteKind>();
  for (const [stepIndex, step] of document.steps.entries()) {
    for (const [beatIndex, beat] of step.beats.entries()) {
      for (const [actionIndex, action] of beat.actions.entries()) {
        const path = `/steps/${stepIndex}/beats/${beatIndex}/actions/${actionIndex}`;
        if (action.do === "write") {
          if (!plan.writeKinds.includes(action.kind)) {
            violations.push({
              stage: "semantic",
              code: "OLL_CAPABILITY_NOT_ALLOWED",
              path: `${path}/kind`,
              message: `write:${action.kind} is not allowed by this request's capability plan`,
            });
          }
          nodeKindByAlias.set(action.as, action.kind);
          continue;
        }
        if (!plan.actions.includes(action.do)) {
          violations.push({
            stage: "semantic",
            code: "OLL_CAPABILITY_NOT_ALLOWED",
            path: `${path}/do`,
            message: `${action.do} is not allowed by this request's capability plan`,
          });
          continue;
        }
        if (action.do === "revise") {
          const targetAlias = referenceRoot(action.target);
          const targetKind = nodeKindByAlias.get(targetAlias);
          if (!targetKind) {
            violations.push({
              stage: "semantic",
              code: "OLL_REVISE_TARGET_KIND_UNKNOWN",
              path: `${path}/target`,
              message: `revise target '${targetAlias}' was not created earlier in this generated lesson`,
            });
          } else if (!plan.reviseKinds.includes(targetKind as RevisableNodeKind)) {
            violations.push({
              stage: "semantic",
              code: "OLL_REVISE_KIND_NOT_ALLOWED",
              path: `${path}/target`,
              message: `revise is not allowed for ${targetKind} nodes in this request`,
            });
          } else if (!reviseContentMatchesKind(action.content, targetKind as RevisableNodeKind)) {
            violations.push({
              stage: "semantic",
              code: "OLL_REVISE_CONTENT_KIND_MISMATCH",
              path: `${path}/content`,
              message: `revise content must be a complete ${targetKind} replacement`,
            });
          }
        }
      }
    }
  }
  return violations;
}

function validateGeneratedLessonDocument(
  candidate: unknown,
  input: ToolInput,
  brief: LessonBrief,
  capabilityPlan: AuthoringCapabilityPlan,
  requireCoverage = true,
): AuthoringLesson {
  const document = lowerPlannedLessonFields(structuredClone(candidate), brief);

  const schemaResult = validateAuthoringSchema(document);
  if (!schemaResult.valid) {
    const violations = schemaResult.errors.slice(0, 8).map((item): GenerationViolation => ({
      stage: "schema",
      code: "OLL_SCHEMA_VALIDATION_FAILED",
      path: item.instancePath || "/",
      message: item.message || "Schema validation failed",
    }));
    throw new GeneratedLessonError(`OLL schema validation failed: ${formatViolations(violations)}`, undefined, violations);
  }

  const lesson = document as AuthoringLesson;
  const violations: GenerationViolation[] = [];
  try {
    validateAuthoringLesson(lesson, input.session_context ?? { assets: [] });
  } catch (error) {
    violations.push(semanticViolation(error));
  }
  try {
    validateBeatTeachingFocus(lesson);
  } catch (error) {
    violations.push(semanticViolation(error));
  }
  violations.push(...validateAnimationBeatTiming(lesson));
  if (requireCoverage) violations.push(...validateBriefCoverage(lesson, brief));
  violations.push(...validateAllowedCapabilities(lesson, capabilityPlan));
  if (violations.length === 0) {
    try {
      const events = normalizeAuthoringLesson(lesson, {
      lessonId: input.turn_id,
      boardId: "learn-board",
      baseRevision: input.base_revision ?? 0,
      resourceContext: input.session_context ?? { assets: [] },
      });
      reduceCanonicalEvents(events);
    } catch (error) {
      violations.push(semanticViolation(error));
    }
  }
  if (violations.length > 0) {
    throw new GeneratedLessonError(`OLL validation failed: ${formatViolations(violations)}`, undefined, violations);
  }
  return lesson;
}

function validateGeneratedLesson(
  raw: string,
  input: ToolInput,
  brief: LessonBrief,
  capabilityPlan: AuthoringCapabilityPlan,
): AuthoringLesson {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    const violations: GenerationViolation[] = [{
      stage: "schema",
      code: "OLL_INVALID_JSON",
      path: "/",
      message: `JSON parse failed: ${(error as Error).message}`,
    }];
    throw new GeneratedLessonError(formatViolations(violations), raw, violations);
  }
  try {
    return validateGeneratedLessonDocument(document, input, brief, capabilityPlan);
  } catch (error) {
    if (!(error instanceof GeneratedLessonError)) throw error;
    throw new GeneratedLessonError(error.message, raw, error.violations);
  }
}

function buildRequestContext(input: ToolInput): Record<string, unknown> {
  const mayUseExistingBoard = input.request_source === "explicit_board_follow_up";
  return {
    request_source: input.request_source,
    authoritative_request: {
      clauses: authoritativeRequestClauses(input),
    },
    language: input.language ?? "zh-CN",
    teaching_advice: {
      tutor_context: input.tutor_context ?? "耐心、具体、连续讲解",
      learner_context: input.learner_context ?? null,
      rule: "只用于选择讲法，不能增加、删除或否决用户要求",
    },
    session_context: input.session_context ?? { assets: [] },
    existing_board: mayUseExistingBoard
      ? {
          summary: input.board_summary,
          last_applied_action: input.last_applied_action ?? null,
          base_revision: input.base_revision ?? 0,
        }
      : null,
  };
}

function buildPlanningPrompt(
  input: ToolInput,
  previousBrief?: string,
  violations: GenerationViolation[] = [],
): string {
  const repair = previousBrief
    ? `\n\n上一份课程要求与教学设计：\n${previousBrief}\n\n精确校验错误：\n${JSON.stringify(violations, null, 2)}\n保留已正确的用户要求引用和教学设计，只修复这些错误并返回完整对象。`
    : "";
  return `请先用 source_ref 记录 authoritative_request.clauses 中的用户明确要求，再为这些要求设计可执行课程。teaching_advice 不是用户要求，不能建立 request_item。request_source 决定唯一题目来源；不得使用 existing_board 为 self_contained 或 current_image 补题。\n${JSON.stringify(buildRequestContext(input), null, 2)}${repair}`;
}

function buildVerificationPrompt(
  input: ToolInput,
  brief: LessonBrief,
  previousVerification?: string,
  violations: GenerationViolation[] = [],
): string {
  const repair = previousVerification
    ? `\n\n上一份复核结果：\n${previousVerification}\n\n复核结果自身的格式错误：\n${JSON.stringify(violations, null, 2)}\n课程规划没有变化；只修复复核结果并返回完整对象。`
    : "";
  return `请独立复核用户明确要求是否被记录。只有 authoritative_request.clauses 是用户要求；teaching_advice 不是。不要用自己偏好的教法否决已覆盖的用户目标。\n课堂输入：\n${JSON.stringify(buildRequestContext(input), null, 2)}\n\n课程要求与教学设计：\n${JSON.stringify(brief, null, 2)}${repair}`;
}

function validateBriefVerification(candidate: unknown, input: ToolInput, brief: LessonBrief): BriefVerification {
  if (!isRecord(candidate) || !Array.isArray(candidate.missing)
    || !Array.isArray(candidate.contradictions) || !Array.isArray(candidate.suggestions)) {
    throw new GeneratedLessonError("Brief verification must contain missing, contradictions, and suggestions arrays", undefined, [
      briefViolation("BRIEF_VERIFICATION_INVALID_ROOT", "/", "verification must contain missing, contradictions, and suggestions arrays"),
    ]);
  }
  const clauseRefs = new Set(authoritativeRequestClauses(input).map((clause) => clause.ref));
  const requestItemIds = new Set(brief.request_items.map((item) => item.id));
  const violations: GenerationViolation[] = [];
  const validateMissing = (raw: unknown, path: string): void => {
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_ITEM", path, "verification item must be an object"));
      return;
    }
    if (typeof raw.source_ref !== "string" || !clauseRefs.has(raw.source_ref)) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_SOURCE_REF", `${path}/source_ref`, "source_ref must reference one supplied authoritative request clause"));
    }
    if (typeof raw.reason !== "string" || !raw.reason.trim()) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_REASON", `${path}/reason`, "verification reason is required"));
    }
  };
  const validateRequestItemReference = (
    raw: unknown,
    path: string,
    textField: "reason" | "suggestion",
  ): void => {
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_ITEM", path, "verification item must be an object"));
      return;
    }
    if (typeof raw.request_item_id !== "string" || !requestItemIds.has(raw.request_item_id)) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_REQUEST_ITEM", `${path}/request_item_id`, "request_item_id must reference one request item"));
    }
    if (typeof raw[textField] !== "string" || !raw[textField].trim()) {
      violations.push(briefViolation("BRIEF_VERIFICATION_INVALID_REASON", `${path}/${textField}`, `${textField} is required`));
    }
  };
  candidate.missing.forEach((raw, index) => validateMissing(raw, `/missing/${index}`));
  candidate.contradictions.forEach((raw, index) =>
    validateRequestItemReference(raw, `/contradictions/${index}`, "reason"));
  candidate.suggestions.forEach((raw, index) =>
    validateRequestItemReference(raw, `/suggestions/${index}`, "suggestion"));
  if (violations.length > 0) {
    throw new GeneratedLessonError(`Brief verification failed validation: ${formatViolations(violations)}`, undefined, violations);
  }
  return candidate as unknown as BriefVerification;
}

function briefVerificationViolations(
  verification: BriefVerification,
  input: ToolInput,
  brief: LessonBrief,
): GenerationViolation[] {
  const clauseByRef = new Map(authoritativeRequestClauses(input).map((clause) => [clause.ref, clause] as const));
  const requestItemById = new Map(brief.request_items.map((item) => [item.id, item] as const));
  return [
    ...verification.missing.map((item, index): GenerationViolation => {
      const clause = clauseByRef.get(item.source_ref);
      return {
        stage: "brief",
        code: "BRIEF_REQUIREMENT_MISSING",
        path: `/verification/missing/${index}`,
        message: `${clause?.text ?? item.source_ref}: ${item.reason}`,
      };
    }),
    ...verification.contradictions.map((item, index): GenerationViolation => ({
      stage: "brief",
      code: "BRIEF_REQUIREMENT_CONTRADICTION",
      path: `/verification/contradictions/${index}`,
      message: `${requestItemById.get(item.request_item_id)?.id ?? item.request_item_id}: ${item.reason}`,
    })),
  ];
}

function compactCandidate(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

function buildGenerationPrompt(
  input: ToolInput,
  brief: LessonBrief,
  capabilityPlan: AuthoringCapabilityPlan,
  previousCandidate?: string,
  violations: GenerationViolation[] = [],
): string {
  const repair = previousCandidate
    ? `\n\n上一份候选 OLL（必须保留其中已正确的教学内容与白板动作）：\n${compactCandidate(previousCandidate)}\n\n精确校验错误：\n${JSON.stringify(violations, null, 2)}\n只针对这些 violation 修复，返回完整 OLL 对象。`
    : "";
  return `请根据以下课堂上下文和课程要求清单生成本轮完整课程。只输出 OLL JSON。request_source 已经确定本轮题目的唯一来源：self_contained 只使用 learner_request，current_image 以 source_observation 为权威题面，explicit_board_follow_up 才允许使用 existing_board。不得跨来源替换、补全或改写当前题目。existing_board 为 null 时，必须从 new_region 开始。

本次允许使用的 OLL 能力如下；系统提示词中提到但未列入这里的 kind 或 action，本次不得使用。需要展示中间变化但 revise 未开放时，请新建下一个板书节点，不要猜测 revise.target：
${JSON.stringify({
    write_kinds: capabilityPlan.writeKinds,
    actions: capabilityPlan.actions.filter((action) => action !== "connect"),
    revise_kinds: capabilityPlan.reviseKinds,
    system_managed_variables: capabilityPlan.allowVariables,
    system_managed_connections: brief.visual_relationships,
    bindings: capabilityPlan.bindingKinds,
    angle_control: capabilityPlan.allowAngleControl,
  }, null, 2)}

共享变量硬性落地清单：
${JSON.stringify(brief.shared_variable_requirements.map((requirement) => ({
    variable: requirement.variable,
    system_inserted_slider: {
      initial: requirement.initial,
      min: requirement.min,
      max: requirement.max,
      label: requirement.label,
      unit: requirement.unit,
      step: requirement.slider_step,
    },
    required_animation: {
      variable: requirement.variable,
      value: requirement.animate_to,
      easing: requirement.easing,
      duration_intent: requirement.duration_intent,
    },
    required_bindings_on: requirement.bound_visuals,
    required_direct_angle_control_on: requirement.direct_angle_geometry || null,
    direct_control_input: requirement.direct_angle_geometry
      ? "该 geometry 必须包含同一变量驱动的圆上点 x/y bindings，并用半径线连接该点与圆心"
      : null,
  })), null, 2)}
system_inserted_slider 由系统写入 lesson.variables，student_task_requirements 和 scene3d_task_requirements 由系统写入 lesson.tasks，模型都不要自行复制。required_direct_angle_control_on 非空时，模型必须提供可唯一识别的圆心、圆上点、半径线和该点的 x/y 变量绑定，系统据此补入 interaction；找不到唯一对象会校验失败。动画必须逐字采用 required_animation 中的 variable、value、easing 和 duration_intent。
每个 required_animation 必须放在独立的简短 Beat：图形和连接先在前一 Beat 创建；动画 Beat 只保留一个 animate 和 after_speech focus，并把完整推导放在相邻 Beat。

课堂上下文：
${JSON.stringify(buildRequestContext(input), null, 2)}

课程要求清单：
${JSON.stringify(brief, null, 2)}${repair}`;
}

function parseServiceAccount(): VertexServiceAccount {
  const raw = requireNonEmptyString(process.env.VERTEX_SA_JSON, "VERTEX_SA_JSON");
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new Error(`VERTEX_SA_JSON is not valid JSON: ${(error as Error).message}`);
  }
  const value = candidate as Partial<VertexServiceAccount>;
  return {
    project_id: requireNonEmptyString(value.project_id, "VERTEX_SA_JSON.project_id"),
    client_email: requireNonEmptyString(value.client_email, "VERTEX_SA_JSON.client_email"),
    private_key: requireNonEmptyString(value.private_key, "VERTEX_SA_JSON.private_key"),
    ...(typeof value.token_uri === "string" ? { token_uri: value.token_uri } : {}),
  };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function vertexAccessToken(account: VertexServiceAccount, timeoutMs: number): Promise<string> {
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Vertex OAuth failed (${response.status}): ${body.slice(0, MAX_ERROR_BODY_LENGTH)}`);
  const payload = JSON.parse(body) as { access_token?: unknown };
  return requireNonEmptyString(payload.access_token, "Vertex OAuth access_token");
}

function vertexEndpoint(project: string, location: string, model: string): string {
  const base = (process.env.VERTEX_BASE_URL || "https://aiplatform.googleapis.com/v1beta1").replace(/\/+$/, "");
  return `${base}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`
    + `/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

function vertexResponseContent(payload: unknown): string {
  const root = payload as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: unknown }> };
    }>;
  };
  const candidate = root?.candidates?.[0];
  if (!candidate) throw new Error("Vertex response contains no candidates");
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new ToolExecutionError("VERTEX_RESPONSE_TRUNCATED", "Vertex response was truncated at maxOutputTokens");
  }
  const text = candidate.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error(`Vertex response contains no JSON text (finishReason=${candidate.finishReason ?? "unknown"})`);
  return text;
}

export async function createVertexClient(): Promise<VertexClient> {
  const account = parseServiceAccount();
  const model = process.env.OLL_MODEL?.trim() || DEFAULT_MODEL;
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || account.project_id;
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
  const timeoutMs = parsePositiveInteger(process.env.OLL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "OLL_TIMEOUT_MS");
  const totalTimeoutMs = parsePositiveInteger(
    process.env.OLL_TOTAL_TIMEOUT_MS,
    DEFAULT_TOTAL_TIMEOUT_MS,
    "OLL_TOTAL_TIMEOUT_MS",
  );
  const maxTokens = parsePositiveInteger(process.env.OLL_MAX_TOKENS, DEFAULT_MAX_TOKENS, "OLL_MAX_TOKENS");
  const deadlineAt = Date.now() + totalTimeoutMs;
  const authStartedAt = Date.now();
  stageLog({ stage: "vertex-auth", status: "started" });
  let accessToken: string;
  try {
    accessToken = await vertexAccessToken(account, Math.min(timeoutMs, totalTimeoutMs));
    stageLog({
      stage: "vertex-auth",
      status: "completed",
      elapsed_ms: Date.now() - authStartedAt,
    });
  } catch (error) {
    const timeoutError = error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError");
    stageLog({
      stage: "vertex-auth",
      status: "failed",
      elapsed_ms: Date.now() - authStartedAt,
      error_code: timeoutError ? "VERTEX_AUTH_TIMEOUT" : "VERTEX_AUTH_FAILED",
    });
    if (timeoutError) {
      throw new ToolExecutionError("VERTEX_AUTH_TIMEOUT", "Vertex authentication exceeded its timeout");
    }
    throw error;
  }
  return {
    endpoint: vertexEndpoint(project, location, model),
    accessToken,
    timeoutMs,
    maxTokens,
    deadlineAt,
    requestAttempts: parsePositiveInteger(
      process.env.VERTEX_REQUEST_ATTEMPTS,
      DEFAULT_VERTEX_REQUEST_ATTEMPTS,
      "VERTEX_REQUEST_ATTEMPTS",
    ),
  };
}

function requestDeadline(client: VertexClient): number {
  return Math.min(
    Date.now() + client.timeoutMs,
    client.deadlineAt ?? Number.POSITIVE_INFINITY,
  );
}

function timeoutUntil(deadlineAt: number, label: string): number {
  const remaining = Math.floor(deadlineAt - Date.now());
  if (remaining <= 0) {
    throw new ToolExecutionError(
      "LESSON_GENERATION_TIMEOUT",
      `The lesson generation time budget was exhausted during ${label}`,
    );
  }
  return remaining;
}

function stageLog(payload: Record<string, unknown>): void {
  process.stderr.write(`learning-coach: ${JSON.stringify(payload)}\n`);
}

export function buildVertexSchemaContract(
  inputCandidate: Record<string, unknown>,
  briefCandidate: unknown,
): {
  schema: JsonSchema;
  capabilityPlan: AuthoringCapabilityPlan;
  diagnostics: ReturnType<typeof schemaDiagnostics>;
} {
  const input = parseToolInput(JSON.stringify(inputCandidate));
  const brief = validateLessonBrief(briefCandidate, input);
  const capabilityPlan = deriveAuthoringCapabilityPlan(input, brief);
  const schema = buildAuthoringResponseJsonSchema(brief, capabilityPlan);
  return { schema, capabilityPlan, diagnostics: schemaDiagnostics(schema) };
}

export async function probeVertexSchema(
  client: VertexClient,
  schema: JsonSchema,
): Promise<{
  ok: boolean;
  status: number;
  finishReason?: string;
  error?: string;
  requestId?: string;
}> {
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: "Return one JSON object matching the provided response schema." }] },
    contents: [{ role: "user", parts: [{ text: "Generate a minimal valid object." }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });
  let response: Response | undefined;
  let body = "";
  for (let attempt = 1; attempt <= client.requestAttempts; attempt += 1) {
    response = await fetch(client.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${client.accessToken}`,
        "content-type": "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(client.timeoutMs),
    });
    body = await response.text();
    if (response.ok || (response.status !== 429 && response.status < 500) || attempt === client.requestAttempts) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(1_000 * 2 ** (attempt - 1), 4_000)));
  }
  if (!response) throw new Error("Vertex Schema probe did not make a request");
  const requestId = response.headers.get("x-goog-request-id") ?? undefined;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body.slice(0, MAX_ERROR_BODY_LENGTH),
      ...(requestId ? { requestId } : {}),
    };
  }
  let finishReason: string | undefined;
  try {
    const payload = JSON.parse(body) as { candidates?: Array<{ finishReason?: string }> };
    finishReason = payload.candidates?.[0]?.finishReason;
  } catch {
    // A 2xx response is sufficient for this provider-Schema contract probe.
  }
  return {
    ok: true,
    status: response.status,
    ...(finishReason ? { finishReason } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

async function callStructuredModel(client: VertexClient, request: StructuredModelRequest): Promise<string> {
  const startedAt = Date.now();
  const deadlineAt = requestDeadline(client);
  stageLog({ stage: "model-call", turn_id: request.turnId, label: request.label, status: "started" });
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: request.maxTokens ?? client.maxTokens,
      responseMimeType: "application/json",
      responseJsonSchema: request.responseSchema,
    },
  });
  let body = "";
  let status = 0;
  try {
    let usedAttempts = 0;
    for (let requestAttempt = 1; requestAttempt <= client.requestAttempts; requestAttempt += 1) {
      usedAttempts = requestAttempt;
      const response = await fetch(client.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${client.accessToken}`,
          "content-type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(timeoutUntil(deadlineAt, request.label)),
      });
      status = response.status;
      body = await response.text();
      if (response.ok) break;
      const retryable = status === 429 || status >= 500;
      if (!retryable || requestAttempt === client.requestAttempts) {
        const code = status === 400 ? "VERTEX_SCHEMA_REJECTED" : "VERTEX_REQUEST_FAILED";
        throw new ToolExecutionError(code, `Vertex ${request.label} failed (${status}): ${body.slice(0, MAX_ERROR_BODY_LENGTH)}`);
      }
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const requestedDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 10_000)
        : Math.min(1_000 * 2 ** (requestAttempt - 1), 4_000);
      const delayMs = Math.min(requestedDelayMs, timeoutUntil(deadlineAt, request.label));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      throw new Error(`Vertex returned a non-JSON API response: ${(error as Error).message}`);
    }
    if (process.env.OLL_DEBUG_GENERATION === "1") {
      process.stderr.write(`learning-coach: raw Vertex ${request.label} payload: ${JSON.stringify(payload).slice(0, 16_000)}\n`);
    }
    const content = vertexResponseContent(payload);
    stageLog({
      stage: "model-call",
      turn_id: request.turnId,
      label: request.label,
      status: "completed",
      http_status: status,
      request_attempts: usedAttempts,
      elapsed_ms: Date.now() - startedAt,
    });
    return content;
  } catch (error) {
    const timeoutError = error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError");
    const surfacedError = timeoutError
      ? new ToolExecutionError(
          client.deadlineAt !== undefined && Date.now() >= client.deadlineAt
            ? "LESSON_GENERATION_TIMEOUT"
            : "VERTEX_REQUEST_TIMEOUT",
          client.deadlineAt !== undefined && Date.now() >= client.deadlineAt
            ? `The lesson generation time budget was exhausted during ${request.label}`
            : `Vertex ${request.label} exceeded its request timeout`,
        )
      : error;
    stageLog({
      stage: "model-call",
      turn_id: request.turnId,
      label: request.label,
      status: "failed",
      http_status: status || null,
      elapsed_ms: Date.now() - startedAt,
      error_code: surfacedError instanceof ToolExecutionError ? surfacedError.code : "MODEL_RESPONSE_FAILED",
    });
    throw surfacedError;
  }
}

async function verifyLessonBrief(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
): Promise<BriefVerification> {
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_VERIFICATION_ATTEMPTS,
    3,
    "OLL_VERIFICATION_ATTEMPTS",
  );
  let previousVerification: string | undefined;
  let violations: GenerationViolation[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw = "";
    try {
      raw = await callStructuredModel(client, {
        label: "lesson-brief-verification",
        turnId: input.turn_id,
        systemPrompt: BRIEF_VERIFICATION_SYSTEM_PROMPT,
        prompt: buildVerificationPrompt(input, brief, previousVerification, violations),
        responseSchema: buildBriefVerificationResponseJsonSchema(input, brief),
        maxTokens: Math.min(client.maxTokens, attempt === 1 ? 4_096 : 8_192),
      });
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch (error) {
        const parseViolation = briefViolation(
          "BRIEF_VERIFICATION_INVALID_JSON",
          "/",
          `JSON parse failed: ${(error as Error).message}`,
        );
        throw new GeneratedLessonError(parseViolation.message, raw, [parseViolation]);
      }
      return validateBriefVerification(candidate, input, brief);
    } catch (error) {
      const generatedError = error instanceof GeneratedLessonError
        ? error
        : error instanceof ToolExecutionError && error.code === "VERTEX_RESPONSE_TRUNCATED"
          ? new GeneratedLessonError(error.message, raw, [briefViolation(
              "BRIEF_VERIFICATION_TRUNCATED",
              "/",
              "verification output exceeded its controlled-output budget",
            )])
          : undefined;
      if (!generatedError) throw error;
      process.stderr.write(`learning-coach: rejected lesson brief verification ${attempt}: ${formatViolations(generatedError.violations)}\n`);
      if (raw && process.env.OLL_DEBUG_GENERATION === "1") {
        process.stderr.write(`learning-coach: rejected lesson brief verification payload ${attempt}: ${raw.slice(0, 16_000)}\n`);
      }
      if (attempt === maxAttempts) {
        throw new Error(`Lesson Brief verification failed after ${maxAttempts} attempt(s). Last error: ${generatedError.message}`);
      }
      previousVerification = raw || undefined;
      violations = generatedError.violations;
    }
  }
  throw new Error("Lesson Brief verification failed");
}

async function planLesson(client: VertexClient, input: ToolInput): Promise<LessonBrief> {
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_PLANNING_ATTEMPTS,
    3,
    "OLL_PLANNING_ATTEMPTS",
  );
  let previousBrief: string | undefined;
  let violations: GenerationViolation[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await callStructuredModel(client, {
      label: "lesson-brief",
      turnId: input.turn_id,
      systemPrompt: LESSON_BRIEF_SYSTEM_PROMPT,
      prompt: buildPlanningPrompt(input, previousBrief, violations),
      responseSchema: buildLessonBriefResponseJsonSchema(input),
      maxTokens: Math.min(client.maxTokens, 8_192),
    });
    try {
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch (error) {
        const parseViolation = briefViolation("BRIEF_INVALID_JSON", "/", `JSON parse failed: ${(error as Error).message}`);
        throw new GeneratedLessonError(parseViolation.message, raw, [parseViolation]);
      }
      const brief = validateLessonBrief(canonicalizeBriefAliases(candidate), input);
      const verification = await verifyLessonBrief(client, input, brief);
      const coverageViolations = briefVerificationViolations(verification, input, brief);
      if (coverageViolations.length > 0) {
        throw new GeneratedLessonError(
          `Course requirements did not cover the authoritative request: ${formatViolations(coverageViolations)}`,
          raw,
          coverageViolations,
        );
      }
      if (verification.suggestions.length > 0) {
        process.stderr.write(`learning-coach: ${JSON.stringify({
          stage: "lesson-brief-review-suggestions",
          turn_id: input.turn_id,
          suggestion_count: verification.suggestions.length,
          request_item_ids: [...new Set(verification.suggestions.map((item) => item.request_item_id))],
        })}\n`);
      }
      return brief;
    } catch (error) {
      if (!(error instanceof GeneratedLessonError)) throw error;
      process.stderr.write(`learning-coach: rejected lesson brief ${attempt}: ${formatViolations(error.violations)}\n`);
      if (process.env.OLL_DEBUG_GENERATION === "1") {
        process.stderr.write(`learning-coach: rejected lesson brief payload ${attempt}: ${raw.slice(0, 16_000)}\n`);
      }
      if (attempt === maxAttempts) {
        throw new Error(`Lesson Brief failed validation after ${maxAttempts} attempt(s). Last error: ${error.message}`);
      }
      previousBrief = raw;
      violations = error.violations;
    }
  }
  throw new Error("Lesson Brief planning failed");
}

function deriveParallelLessonSections(brief: LessonBrief): ParallelLessonSectionPlan[] {
  const sections: ParallelLessonSectionPlan[] = [];
  if (brief.visual_requirements.length > 0) {
    sections.push({
      id: "observe",
      title: "先看清对象",
      purpose: brief.visual_requirements.map((requirement) => requirement.purpose).join("；"),
      visualRequirementIds: brief.visual_requirements.map((requirement) => requirement.id),
    });
  }
  const goalGroupSize = Math.max(
    1,
    Math.ceil(brief.teaching_goal_requirements.length / 4),
  );
  for (let start = 0; start < brief.teaching_goal_requirements.length; start += goalGroupSize) {
    const index = Math.floor(start / goalGroupSize);
    const requirements = brief.teaching_goal_requirements.slice(start, start + goalGroupSize);
    sections.push({
      id: `explain-${index + 1}`,
      title: `理解关键点 ${index + 1}`,
      purpose: requirements.map((requirement) => requirement.goal).join("；"),
      visualRequirementIds: [],
    });
  }
  if (sections.length === 0) {
    sections.push({
      id: "explain-1",
      title: "理解核心问题",
      purpose: brief.request_summary,
      visualRequirementIds: [],
    });
  }
  if (sections.length === 1) {
    sections.push({
      id: "consolidate",
      title: "梳理结论",
      purpose: `用简短结论和例子巩固：${sections[0].purpose}`,
      visualRequirementIds: [],
    });
  }
  return sections;
}

function exactVisualComponentSchema(
  responseSchema: JsonSchema,
  requirement: VisualRequirement,
): JsonSchema {
  const definitions = isRecord(responseSchema.$defs) ? structuredClone(responseSchema.$defs) : {};
  const action = isRecord(definitions.action) ? definitions.action : {};
  const variants = Array.isArray(action.anyOf) ? action.anyOf.filter(isRecord) : [];
  const variant = variants.find((candidate) => {
    const properties = isRecord(candidate.properties) ? candidate.properties : {};
    const aliases = isRecord(properties.as) && Array.isArray(properties.as.enum)
      ? properties.as.enum
      : [];
    return aliases.length === 1 && aliases[0] === requirement.id;
  });
  if (!variant) {
    throw new ToolExecutionError(
      "VERTEX_SCHEMA_INCOMPATIBLE",
      `No exact visual component Schema is available for '${requirement.id}'`,
    );
  }
  const schema = pruneUnusedDefinitions({
    ...structuredClone(variant),
    $defs: definitions,
  });
  assertVertexSchemaCompatible(schema);
  return schema;
}

function parallelSectionSchema(responseSchema: JsonSchema): JsonSchema {
  const definitions = isRecord(responseSchema.$defs) ? structuredClone(responseSchema.$defs) : {};
  const action = isRecord(definitions.action) ? definitions.action : {};
  const variants = Array.isArray(action.anyOf) ? action.anyOf.filter(isRecord) : [];
  action.anyOf = variants.filter((variant) => {
    const identity = actionVariantIdentity(variant);
    if (identity.action === "write") {
      return identity.kind === "text"
        || identity.kind === "math"
        || identity.kind === "note"
        || identity.kind === "shape";
    }
    return identity.action === "focus";
  });
  const step = isRecord(definitions.step) ? definitions.step : undefined;
  if (!step || !Array.isArray(action.anyOf) || action.anyOf.length === 0) {
    throw new ToolExecutionError("VERTEX_SCHEMA_INCOMPATIBLE", "No Step Schema is available for parallel authoring");
  }
  const schema = pruneUnusedDefinitions({
    ...structuredClone(step),
    $defs: definitions,
  });
  assertVertexSchemaCompatible(schema);
  return schema;
}

function parseParallelStep(
  raw: string,
  section: ParallelLessonSectionPlan,
  visualAliases: string[],
): AuthoringLesson["steps"][number] {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new GeneratedLessonError(`Parallel section is not JSON: ${(error as Error).message}`, raw);
  }
  if (!isRecord(candidate) || !Array.isArray(candidate.beats) || candidate.beats.length === 0) {
    throw new GeneratedLessonError("Parallel section must be one non-empty Step", raw);
  }
  candidate.key = section.id;
  candidate.purpose = section.purpose;
  const renamedAliases = new Map<string, string>();
  for (const [beatIndex, beat] of candidate.beats.entries()) {
    if (!isRecord(beat) || !Array.isArray(beat.actions)) {
      throw new GeneratedLessonError("Parallel section contains an invalid Beat", raw);
    }
    const originalKey = typeof beat.key === "string" ? beat.key : `beat-${beatIndex + 1}`;
    beat.key = originalKey.startsWith(`${section.id}-`)
      ? originalKey
      : `${section.id}-${originalKey}`;
    for (const action of beat.actions) {
      if (!isRecord(action) || action.do !== "write" || typeof action.as !== "string") continue;
      if (renamedAliases.has(action.as)) {
        throw new GeneratedLessonError(`Parallel section repeats alias '${action.as}'`, raw);
      }
      renamedAliases.set(
        action.as,
        action.as.startsWith(`${section.id}-`) ? action.as : `${section.id}-${action.as}`,
      );
    }
  }
  const knownAliases = new Set(visualAliases);
  for (const beat of candidate.beats) {
    const actions = (beat as Record<string, unknown>).actions as unknown[];
    for (const action of actions) {
      if (!isRecord(action) || action.do !== "write" || typeof action.as !== "string") continue;
      action.as = renamedAliases.get(action.as) ?? action.as;
      if (isRecord(action.place) && typeof action.place.anchor === "string") {
        action.place.anchor = renamedAliases.get(action.place.anchor) ?? action.place.anchor;
      }
      knownAliases.add(action.as);
    }
    for (const action of actions) {
      if (!isRecord(action) || action.do !== "focus" || !Array.isArray(action.targets)) continue;
      action.targets = action.targets
        .map((target) => typeof target === "string" ? renamedAliases.get(target) ?? target : target)
        .filter((target) => typeof target === "string" && knownAliases.has(target));
    }
    const hasAfterSpeechFocus = actions.some((action) => isRecord(action)
      && action.do === "focus"
      && action.when === "after_speech"
      && Array.isArray(action.targets)
      && action.targets.length > 0);
    if (!hasAfterSpeechFocus) {
      const target = [...knownAliases].at(-1);
      if (!target) {
        throw new GeneratedLessonError("Parallel section Beat has nothing to focus", raw);
      }
      actions.push({
        do: "focus",
        when: "after_speech",
        targets: [target],
        intent: "current_step",
      });
    }
  }
  return candidate as unknown as AuthoringLesson["steps"][number];
}

async function generateParallelSection(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
  section: ParallelLessonSectionPlan,
  responseSchema: JsonSchema,
): Promise<AuthoringLesson["steps"][number]> {
  const raw = await callStructuredModel(client, {
    label: "lesson-section",
    turnId: input.turn_id,
    systemPrompt: PARALLEL_SECTION_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      section,
      available_visuals: brief.visual_requirements.map((requirement) => ({
        id: requirement.id,
        surface: requirement.surface,
        purpose: requirement.purpose,
      })),
      teaching_goals: brief.teaching_goal_requirements,
      learner_context: input.learner_context ?? null,
      language: input.language ?? "zh-CN",
    }, null, 2),
    responseSchema,
    maxTokens: Math.min(client.maxTokens, 8_192),
  });
  return parseParallelStep(
    raw,
    section,
    brief.visual_requirements.map((requirement) => requirement.id),
  );
}

function visualComponentSemanticViolations(
  action: Record<string, unknown>,
  input: ToolInput,
  brief: LessonBrief,
  requirement: VisualRequirement,
): GenerationViolation[] {
  const componentBrief = structuredClone(brief);
  componentBrief.visual_requirements = [structuredClone(requirement)];
  componentBrief.visual_relationships = [];
  componentBrief.shared_variable_requirements = componentBrief.shared_variable_requirements
    .filter((variable) => variable.bound_visuals.includes(requirement.id))
    .map((variable) => ({
      ...variable,
      bound_visuals: [requirement.id],
      direct_angle_geometry: variable.direct_angle_geometry === requirement.id
        ? requirement.id
        : "",
    }));
  componentBrief.student_task_requirements = [];
  componentBrief.scene3d_task_requirements = [];

  const step: AuthoringLesson["steps"][number] = {
    key: "validate-component",
    purpose: requirement.purpose,
    beats: [{
      key: "validate-component-beat",
      say: "检查这个视觉组件。",
      actions: [
        structuredClone(action) as AuthoringLesson["steps"][number]["beats"][number]["actions"][number],
        {
          do: "focus",
          when: "after_speech",
          targets: [requirement.id],
          intent: "current_step",
        },
      ],
    }],
  };
  try {
    validateGeneratedLessonDocument(
      assembleParallelLesson(input, componentBrief, [step]),
      input,
      componentBrief,
      deriveAuthoringCapabilityPlan(input, componentBrief),
      false,
    );
    return [];
  } catch (error) {
    if (!(error instanceof GeneratedLessonError)) throw error;
    return error.violations.map((violation) => ({
      ...violation,
      requirement_id: requirement.id,
    }));
  }
}

async function generateVisualComponent(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
  requirement: VisualRequirement,
  responseSchema: JsonSchema,
): Promise<Record<string, unknown>> {
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_GENERATION_ATTEMPTS,
    3,
    "OLL_GENERATION_ATTEMPTS",
  );
  const sharedVariables = brief.shared_variable_requirements.filter((variable) =>
    variable.bound_visuals.includes(requirement.id));
  let previousComponent: unknown;
  let violations: GenerationViolation[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw: string;
    try {
      raw = await callStructuredModel(client, {
        label: "lesson-visual-component",
        turnId: input.turn_id,
        systemPrompt: VISUAL_COMPONENT_SYSTEM_PROMPT,
        prompt: JSON.stringify({
          visual_requirement: requirement,
          shared_variables: sharedVariables,
          session_context: input.session_context ?? { assets: [] },
          ...(previousComponent === undefined && violations.length === 0
            ? {}
            : {
                ...(previousComponent === undefined ? {} : { previous_component: previousComponent }),
                validation_errors: violations,
              }),
        }, null, 2),
        responseSchema,
        maxTokens: Math.min(client.maxTokens, 8_192),
      });
    } catch (error) {
      if (!(error instanceof ToolExecutionError)
        || error.code !== "VERTEX_RESPONSE_TRUNCATED") throw error;
      violations = [{
        stage: "schema",
        code: error.code,
        path: "/",
        requirement_id: requirement.id,
        message: `${error.message}; return only the minimum fields and elements required for this visual component`,
      }];
      process.stderr.write(`learning-coach: rejected visual component '${requirement.id}' ${attempt}: ${formatViolations(violations)}\n`);
      if (attempt < maxAttempts) continue;
      throw new GeneratedLessonError(
        `Visual component '${requirement.id}' failed after ${maxAttempts} attempt(s)`,
        undefined,
        violations,
      );
    }
    let action: unknown;
    try {
      action = JSON.parse(raw);
    } catch (error) {
      violations = [{
        stage: "schema",
        code: "OLL_INVALID_JSON",
        path: "/",
        requirement_id: requirement.id,
        message: `Visual component is not JSON: ${(error as Error).message}`,
      }];
      previousComponent = raw;
      if (attempt < maxAttempts) continue;
      throw new GeneratedLessonError(violations[0].message, raw, violations);
    }
    if (!isRecord(action)
      || action.do !== "write"
      || action.as !== requirement.id
      || action.kind !== requirement.surface) {
      violations = [{
        stage: "request_coverage",
        code: "OLL_VISUAL_IDENTITY_MISMATCH",
        path: "/",
        requirement_id: requirement.id,
        message: `Visual component '${requirement.id}' changed its planned identity`,
      }];
    } else {
      const loweredComponent = lowerPlannedLessonFields({
        lesson: { goals: [] },
        steps: [{ beats: [{ actions: [structuredClone(action)] }] }],
      }, brief);
      const loweredSteps = isRecord(loweredComponent) && Array.isArray(loweredComponent.steps)
        ? loweredComponent.steps
        : [];
      const loweredStep = loweredSteps[0];
      const loweredBeats = isRecord(loweredStep) && Array.isArray(loweredStep.beats)
        ? loweredStep.beats
        : [];
      const loweredBeat = loweredBeats[0];
      const loweredActions = isRecord(loweredBeat) && Array.isArray(loweredBeat.actions)
        ? loweredBeat.actions
        : [];
      const loweredAction = loweredActions.find((candidate) => isRecord(candidate)
        && candidate.do === "write" && candidate.as === requirement.id);
      const node = isRecord(loweredAction) ? inventoryWrite(loweredAction) : undefined;
      const missingFeatures = node
        ? requirement.required_features.filter((feature) => !node.features.has(feature))
        : requirement.required_features;
      const actualExpressions = node?.expressions.map(normalizeExpression) ?? [];
      const missingExpressions = requirement.expressions.filter(
        (expression) => !actualExpressions.includes(normalizeExpression(expression)),
      );
      violations = [];
      if (!node || node.surface !== requirement.surface
        || missingFeatures.length > 0 || missingExpressions.length > 0) {
        violations.push({
          stage: "request_coverage",
          code: "OLL_VISUAL_REQUIREMENT_UNSATISFIED",
          path: "/content",
          requirement_id: requirement.id,
          message: `Visual component '${requirement.id}' is incomplete`,
          missing_features: missingFeatures,
          missing_expressions: missingExpressions,
        });
      }
      if (node && sharedVariables.some((variable) =>
        !Array.isArray(node.content.bindings)
        || !node.content.bindings.some((binding) => isRecord(binding)
          && typeof binding.target === "string"
          && expressionReferencesVariable(binding.expression, variable.variable)))) {
        violations.push({
          stage: "request_coverage",
          code: "OLL_SHARED_VARIABLE_BINDING_UNSATISFIED",
          path: "/content/bindings",
          requirement_id: requirement.id,
          message: `Visual component '${requirement.id}' must bind every planned shared variable`,
        });
      }
      const motionVariable = sharedVariables[0];
      if (node?.surface === "geometry" && motionVariable
        && !geometryMotionSatisfied(node.content, requirement, motionVariable.variable)) {
        violations.push({
          stage: "request_coverage",
          code: "OLL_VISUAL_MOTION_UNSATISFIED",
          path: "/content",
          requirement_id: requirement.id,
          message: `Visual component '${requirement.id}' needs one variable-driven point whose label contains motion_subject '${requirement.motion_subject ?? ""}' and whose bound coordinates match motion_kind '${requirement.motion_kind ?? ""}'`,
        });
      }
      if (violations.length === 0) {
        violations.push(...visualComponentSemanticViolations(
          action,
          input,
          brief,
          requirement,
        ));
      }
    }
    if (violations.length === 0) return action as Record<string, unknown>;
    previousComponent = action;
    process.stderr.write(`learning-coach: rejected visual component '${requirement.id}' ${attempt}: ${formatViolations(violations)}\n`);
    if (attempt === maxAttempts) {
      throw new GeneratedLessonError(
        `Visual component '${requirement.id}' failed after ${maxAttempts} attempt(s)`,
        raw,
        violations,
      );
    }
  }
  throw new GeneratedLessonError(`Visual component '${requirement.id}' failed`);
}

function injectVisualComponents(
  step: AuthoringLesson["steps"][number],
  components: Record<string, unknown>[],
): void {
  const firstBeat = step.beats[0] as unknown as Record<string, unknown>;
  if (!Array.isArray(firstBeat.actions)) {
    throw new GeneratedLessonError("The first parallel section Beat has no actions");
  }
  let previousAlias: string | undefined;
  for (const [index, component] of components.entries()) {
    component.place = index === 0 || !previousAlias
      ? { relation: "new_region" }
      : { relation: index % 2 === 1 ? "right_of" : "below", anchor: previousAlias, gap: "normal" };
    previousAlias = typeof component.as === "string" ? component.as : previousAlias;
  }
  const focusIndex = firstBeat.actions.findIndex((action) => isRecord(action) && action.do === "focus");
  firstBeat.actions.splice(focusIndex >= 0 ? focusIndex : firstBeat.actions.length, 0, ...components);
  const focus = firstBeat.actions.find((action) => isRecord(action) && action.do === "focus");
  if (isRecord(focus) && Array.isArray(focus.targets)) {
    focus.targets = [...new Set([
      ...components.flatMap((component) => typeof component.as === "string" ? [component.as] : []),
      ...focus.targets.filter((target) => typeof target === "string"),
    ])];
  }
}

function deterministicAnimationStep(brief: LessonBrief): AuthoringLesson["steps"][number] | undefined {
  if (brief.shared_variable_requirements.length === 0) return undefined;
  return {
    key: "observe-change",
    purpose: "观察共享变量驱动的连续变化",
    beats: brief.shared_variable_requirements.map((requirement, index) => ({
      key: `animate-${requirement.variable.replaceAll("_", "-")}-${index + 1}`,
      say: `现在让${requirement.label}自动变化，观察画面怎样同步改变。`,
      delivery: "patient",
      actions: [
        {
          do: "animate",
          variable: requirement.variable,
          value: requirement.animate_to,
          easing: requirement.easing,
          duration_intent: requirement.duration_intent,
        },
        {
          do: "focus",
          when: "after_speech",
          targets: [...requirement.bound_visuals],
          intent: "current_step",
        },
      ],
    })),
  } as AuthoringLesson["steps"][number];
}

function lessonFocus(steps: AuthoringLesson["steps"]): string[] {
  for (const step of [...steps].reverse()) {
    for (const beat of [...step.beats].reverse()) {
      for (const action of [...beat.actions].reverse()) {
        if (action.do === "focus" && Array.isArray(action.targets) && action.targets.length > 0) {
          return [...action.targets];
        }
        if ((action.do === "write" || action.do === "group") && typeof action.as === "string") {
          return [action.as];
        }
      }
    }
  }
  throw new GeneratedLessonError("Parallel lesson has no focusable board object");
}

function assembleParallelLesson(
  input: ToolInput,
  brief: LessonBrief,
  steps: AuthoringLesson["steps"],
): AuthoringLesson {
  const goals = brief.teaching_goal_requirements.map((requirement) => requirement.goal);
  return {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    lesson: {
      mode: "explain",
      language: input.language ?? "zh-CN",
      title: [...brief.request_summary].slice(0, 160).join(""),
      goals: goals.length > 0 ? goals : [brief.request_summary],
    },
    steps: structuredClone(steps),
    close: {
      summary: goals.length > 0 ? goals.join("；") : brief.request_summary,
      focus: lessonFocus(steps),
    },
  };
}

async function generateLessonInParallel(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
  onPrefix: (lesson: AuthoringLesson, part: number) => Promise<void>,
): Promise<{
  lesson: AuthoringLesson;
  attempts: number;
  capabilityPlan: AuthoringCapabilityPlan;
  schema: ReturnType<typeof schemaDiagnostics>;
}> {
  const capabilityPlan = deriveAuthoringCapabilityPlan(input, brief);
  const responseSchema = buildAuthoringResponseJsonSchema(brief, capabilityPlan);
  const diagnostics = schemaDiagnostics(responseSchema);
  const sections = deriveParallelLessonSections(brief);
  const sectionResponseSchema = parallelSectionSchema(responseSchema);
  process.stderr.write(`learning-coach: ${JSON.stringify({
    stage: "lesson-parallel-authoring",
    turn_id: input.turn_id,
    status: "started",
    sections: sections.length,
    visual_components: brief.visual_requirements.length,
  })}\n`);

  const sectionPromises = sections.map((section) =>
    generateParallelSection(client, input, brief, section, sectionResponseSchema));
  const componentPromises = brief.visual_requirements.map((requirement) =>
    generateVisualComponent(
      client,
      input,
      brief,
      requirement,
      exactVisualComponentSchema(responseSchema, requirement),
    ));

  const components = await Promise.all(componentPromises);
  const assembledSteps: AuthoringLesson["steps"] = [];
  for (const [index, sectionPromise] of sectionPromises.entries()) {
    const step = await sectionPromise;
    if (index === 0) injectVisualComponents(step, components);
    assembledSteps.push(step);
    if (index < sectionPromises.length - 1) {
      const prefix = validateGeneratedLessonDocument(
        assembleParallelLesson(input, brief, assembledSteps),
        input,
        brief,
        capabilityPlan,
        false,
      );
      await onPrefix(prefix, index);
    }
  }
  const animationStep = deterministicAnimationStep(brief);
  if (animationStep) assembledSteps.push(animationStep);
  const lesson = validateGeneratedLessonDocument(
    assembleParallelLesson(input, brief, assembledSteps),
    input,
    brief,
    capabilityPlan,
  );
  process.stderr.write(`learning-coach: ${JSON.stringify({
    stage: "lesson-parallel-authoring",
    turn_id: input.turn_id,
    status: "completed",
    sections: assembledSteps.length,
  })}\n`);
  return { lesson, attempts: 1, capabilityPlan, schema: diagnostics };
}

async function generateLesson(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
): Promise<{
  lesson: AuthoringLesson;
  attempts: number;
  capabilityPlan: AuthoringCapabilityPlan;
  schema: ReturnType<typeof schemaDiagnostics>;
}> {
  let previousCandidate: string | undefined;
  let violations: GenerationViolation[] = [];
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_GENERATION_ATTEMPTS,
    3,
    "OLL_GENERATION_ATTEMPTS",
  );
  const capabilityPlan = deriveAuthoringCapabilityPlan(input, brief);
  const responseSchema = buildAuthoringResponseJsonSchema(brief, capabilityPlan);
  const diagnostics = schemaDiagnostics(responseSchema);
  process.stderr.write(`learning-coach: ${JSON.stringify({
    stage: "lesson-authoring-schema",
    turn_id: input.turn_id,
    write_kinds: capabilityPlan.writeKinds,
    actions: capabilityPlan.actions,
    revise_kinds: capabilityPlan.reviseKinds,
    schema_sha256: diagnostics.sha256,
    schema_bytes: diagnostics.bytes,
    action_branches: diagnostics.action_branches,
    definitions: diagnostics.definitions,
  })}\n`);

  const repairVisualComponent = async (
    rawLesson: string,
    generationViolations: GenerationViolation[],
  ): Promise<AuthoringLesson | undefined> => {
    if (generationViolations.length === 0) return undefined;
    const localVisualCodes = new Set(["OLL_VISUAL_REQUIREMENT_UNSATISFIED", "OLL_VISUAL_MOTION_UNSATISFIED"]);
    const requirementIds = new Set(generationViolations.flatMap((violation) =>
      localVisualCodes.has(violation.code)
        && typeof violation.requirement_id === "string"
        ? [violation.requirement_id]
        : []));
    if (requirementIds.size !== 1 || generationViolations.some((violation) =>
      !localVisualCodes.has(violation.code))) return undefined;
    const requirementId = [...requirementIds][0];
    const requirement = brief.visual_requirements.find((candidate) => candidate.id === requirementId);
    if (!requirement) return undefined;

    let candidate: unknown;
    try {
      candidate = JSON.parse(rawLesson);
    } catch {
      return undefined;
    }
    if (!isRecord(candidate) || !Array.isArray(candidate.steps)) return undefined;
    const matches: Array<{ actions: unknown[]; index: number; action: Record<string, unknown> }> = [];
    for (const step of candidate.steps) {
      if (!isRecord(step) || !Array.isArray(step.beats)) continue;
      for (const beat of step.beats) {
        if (!isRecord(beat) || !Array.isArray(beat.actions)) continue;
        beat.actions.forEach((action, index) => {
          if (isRecord(action) && action.do === "write" && action.as === requirementId) {
            matches.push({ actions: beat.actions as unknown[], index, action });
          }
        });
      }
    }
    if (matches.length !== 1) return undefined;

    const definitions = isRecord(responseSchema.$defs) ? responseSchema.$defs : {};
    const actionDefinition = isRecord(definitions.action) ? definitions.action : {};
    const variants = Array.isArray(actionDefinition.anyOf) ? actionDefinition.anyOf.filter(isRecord) : [];
    const componentVariant = variants.find((variant) => {
      const properties = isRecord(variant.properties) ? variant.properties : {};
      const alias = isRecord(properties.as) && Array.isArray(properties.as.enum) ? properties.as.enum : [];
      return alias.length === 1 && alias[0] === requirementId;
    });
    if (!componentVariant) return undefined;
    const componentSchema = pruneUnusedDefinitions({
      ...structuredClone(componentVariant),
      $defs: structuredClone(definitions),
    });
    assertVertexSchemaCompatible(componentSchema);

    const repairedRaw = await callStructuredModel(client, {
      label: "lesson-component-repair",
      turnId: input.turn_id,
      systemPrompt: COMPONENT_REPAIR_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        visual_requirement: requirement,
        current_write_action: matches[0].action,
        validation_errors: generationViolations,
      }, null, 2),
      responseSchema: componentSchema,
      maxTokens: Math.min(client.maxTokens, 8_192),
    });
    let repairedAction: unknown;
    try {
      repairedAction = JSON.parse(repairedRaw);
    } catch {
      return undefined;
    }
    if (!isRecord(repairedAction)
      || repairedAction.do !== "write"
      || repairedAction.as !== requirementId
      || repairedAction.kind !== requirement.surface) return undefined;
    // A local visual repair is allowed to replace only the node's structured
    // content. Identity, teaching role, timing, and placement remain owned by
    // the already-validated lesson structure even if the model returns
    // different top-level values.
    matches[0].actions[matches[0].index] = {
      ...matches[0].action,
      content: repairedAction.content,
    };
    return validateGeneratedLesson(JSON.stringify(candidate), input, brief, capabilityPlan);
  };

  const repairOneBeat = async (
    rawLesson: string,
    generationViolations: GenerationViolation[],
  ): Promise<AuthoringLesson | undefined> => {
    const allowedCodes = new Set(["OLL_DUPLICATE_ALIAS", "OLL_MISSING_BEAT_FOCUS"]);
    if (!generationViolations.some((violation) => violation.code === "OLL_DUPLICATE_ALIAS")
      || generationViolations.some((violation) => !allowedCodes.has(violation.code))) return undefined;
    const locations = generationViolations.flatMap((violation) => {
      const match = /^\/steps\/(\d+)\/beats\/(\d+)(?:\/|$)/u.exec(violation.path);
      return match ? [`${match[1]}:${match[2]}`] : [];
    });
    if (locations.length !== generationViolations.length || new Set(locations).size !== 1) return undefined;
    const [stepIndex, beatIndex] = locations[0].split(":").map(Number);

    let candidate: unknown;
    try {
      candidate = JSON.parse(rawLesson);
    } catch {
      return undefined;
    }
    if (!isRecord(candidate) || !Array.isArray(candidate.steps)) return undefined;
    const targetStep = candidate.steps[stepIndex];
    if (!isRecord(targetStep) || !Array.isArray(targetStep.beats)) return undefined;
    const currentBeat = targetStep.beats[beatIndex];
    if (!isRecord(currentBeat) || typeof currentBeat.key !== "string") return undefined;

    const existingAliases = new Set<string>();
    candidate.steps.forEach((step, candidateStepIndex) => {
      if (!isRecord(step) || !Array.isArray(step.beats)) return;
      step.beats.forEach((beat, candidateBeatIndex) => {
        const beforeTarget = candidateStepIndex < stepIndex
          || (candidateStepIndex === stepIndex && candidateBeatIndex < beatIndex);
        if (!beforeTarget || !isRecord(beat) || !Array.isArray(beat.actions)) return;
        for (const action of beat.actions) {
          if (isRecord(action) && typeof action.as === "string") existingAliases.add(action.as);
        }
      });
    });

    const definitions = isRecord(responseSchema.$defs) ? structuredClone(responseSchema.$defs) : {};
    const resolveDefinition = (schema: unknown): Record<string, unknown> | undefined => {
      if (!isRecord(schema)) return undefined;
      if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/$defs/")) return schema;
      const name = schema.$ref.slice("#/$defs/".length).split("/", 1)[0];
      return isRecord(definitions[name]) ? definitions[name] : undefined;
    };
    const rootProperties = isRecord(responseSchema.properties) ? responseSchema.properties : {};
    const stepsSchema = isRecord(rootProperties.steps) ? rootProperties.steps : {};
    const stepSchema = resolveDefinition(stepsSchema.items) ?? {};
    const stepProperties = isRecord(stepSchema.properties) ? stepSchema.properties : {};
    const beatsSchema = isRecord(stepProperties.beats) ? stepProperties.beats : {};
    const beatTemplate = resolveDefinition(beatsSchema.items);
    const actionDefinition = isRecord(definitions.action) ? definitions.action : undefined;
    if (!beatTemplate || !actionDefinition || !Array.isArray(actionDefinition.anyOf)) return undefined;
    actionDefinition.anyOf = actionDefinition.anyOf.filter((variant) => {
      if (!isRecord(variant) || !isRecord(variant.properties) || !isRecord(variant.properties.as)) return true;
      const aliases = variant.properties.as.enum;
      return !Array.isArray(aliases)
        || aliases.length !== 1
        || typeof aliases[0] !== "string"
        || !existingAliases.has(aliases[0]);
    });
    const beatSchema = pruneUnusedDefinitions({
      ...structuredClone(beatTemplate),
      $defs: definitions,
    });
    assertVertexSchemaCompatible(beatSchema);

    const repairedRaw = await callStructuredModel(client, {
      label: "lesson-beat-repair",
      turnId: input.turn_id,
      systemPrompt: BEAT_REPAIR_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        existing_aliases: [...existingAliases].sort(),
        current_beat: currentBeat,
        validation_errors: generationViolations,
      }, null, 2),
      responseSchema: beatSchema,
      maxTokens: Math.min(client.maxTokens, 12_288),
    });
    let repairedBeat: unknown;
    try {
      repairedBeat = JSON.parse(repairedRaw);
    } catch {
      return undefined;
    }
    if (!isRecord(repairedBeat) || repairedBeat.key !== currentBeat.key) return undefined;
    targetStep.beats[beatIndex] = repairedBeat;
    return validateGeneratedLesson(JSON.stringify(candidate), input, brief, capabilityPlan);
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await callStructuredModel(client, {
      label: "lesson-authoring",
      turnId: input.turn_id,
      systemPrompt: AUTHORING_SYSTEM_PROMPT,
      prompt: buildGenerationPrompt(input, brief, capabilityPlan, previousCandidate, violations),
      responseSchema,
    });
    try {
      return {
        lesson: validateGeneratedLesson(raw, input, brief, capabilityPlan),
        attempts: attempt,
        capabilityPlan,
        schema: diagnostics,
      };
    } catch (error) {
      if (!(error instanceof GeneratedLessonError)) throw error;
      process.stderr.write(`learning-coach: rejected lesson generation ${attempt}: ${formatViolations(error.violations)}\n`);
      if (process.env.OLL_DEBUG_GENERATION === "1") {
        process.stderr.write(`learning-coach: rejected generation ${attempt}: ${raw.slice(0, 16_000)}\n`);
      }
      try {
        const repairedLesson = await repairVisualComponent(raw, error.violations);
        if (repairedLesson) {
          process.stderr.write(`learning-coach: repaired one visual object after lesson generation ${attempt}\n`);
          return {
            lesson: repairedLesson,
            attempts: attempt,
            capabilityPlan,
            schema: diagnostics,
          };
        }
        const repairedBeatLesson = await repairOneBeat(raw, error.violations);
        if (repairedBeatLesson) {
          process.stderr.write(`learning-coach: repaired one Beat after lesson generation ${attempt}\n`);
          return {
            lesson: repairedBeatLesson,
            attempts: attempt,
            capabilityPlan,
            schema: diagnostics,
          };
        }
      } catch (repairError) {
        const message = repairError instanceof GeneratedLessonError
          ? formatViolations(repairError.violations)
          : safeError(repairError);
        process.stderr.write(`learning-coach: local visual repair did not validate: ${message}\n`);
      }
      if (attempt === maxAttempts) {
        throw new Error(`OLL generation failed validation after ${maxAttempts} attempt(s). Last error: ${error.message}`);
      }
      previousCandidate = raw;
      violations = error.violations;
    }
  }
  throw new Error("OLL generation failed");
}

const SELECTION_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    interpretation_kind: {
      type: "string",
      enum: ["text", "math", "geometry", "data", "unknown"],
    },
    interpretation_content: { type: "string" },
    interpretation_confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    response_kind: { type: "string", enum: ["explanation", "plot"] },
    title: { type: "string" },
    text: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    expression: { type: "string" },
    x_min: { type: "number" },
    x_max: { type: "number" },
    y_min: { type: "number" },
    y_max: { type: "number" },
  },
  required: [
    "interpretation_kind",
    "interpretation_content",
    "interpretation_confidence",
    "response_kind",
    "title",
    "text",
    "items",
    "expression",
    "x_min",
    "x_max",
    "y_min",
    "y_max",
  ],
};

function selectionOutputPath(input: SelectionToolInput): string {
  const workDirectory = resolve(process.env.OCTOS_WORK_DIR?.trim() || process.cwd());
  const path = resolve(
    workDirectory,
    "study",
    "selections",
    `${input.turn_id}.octos-selection-enhancement.json`,
  );
  if (!path.startsWith(`${workDirectory}${sep}`) || !isAbsolute(path)) {
    throw new Error("Resolved selection output path escapes OCTOS_WORK_DIR");
  }
  return path;
}

function parseSelectionModelResponse(
  raw: string,
  input: SelectionToolInput,
): SelectionEnhancementArtifact {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Selection enhancement is not JSON: ${(error as Error).message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Selection enhancement must be an object");
  }
  const output = value as Record<string, unknown>;
  const nonEmpty = (name: string) => requireNonEmptyString(output[name], name);
  const kind = nonEmpty("interpretation_kind") as SelectionContentKind;
  if (!["text", "math", "geometry", "data", "unknown"].includes(kind)) {
    throw new Error("interpretation_kind is invalid");
  }
  const confidence = nonEmpty("interpretation_confidence") as "high" | "medium" | "low";
  if (!["high", "medium", "low"].includes(confidence)) {
    throw new Error("interpretation_confidence is invalid");
  }
  const title = nonEmpty("title");
  const text = nonEmpty("text");
  const items = Array.isArray(output.items)
    ? output.items.map((item, index) => requireNonEmptyString(item, `items[${index}]`))
    : [];
  let response: SelectionEnhancementArtifact["response"];
  if (output.response_kind === "plot") {
    const expression = nonEmpty("expression");
    const numbers = [output.x_min, output.x_max, output.y_min, output.y_max];
    if (numbers.some((number) => typeof number !== "number" || !Number.isFinite(number))) {
      throw new Error("Plot ranges must be finite numbers");
    }
    const [xMin, xMax, yMin, yMax] = numbers as number[];
    if (xMax <= xMin || yMax <= yMin) throw new Error("Plot ranges must increase");
    const evaluate = compileMathExpression(expression, ["x"]);
    for (let index = 0; index <= 40; index += 1) {
      const x = xMin + (xMax - xMin) * index / 40;
      const y = evaluate({ x });
      if (typeof y !== "number" || !Number.isFinite(y)) {
        throw new Error("Plot expression is not finite across its range");
      }
    }
    response = {
      kind: "plot",
      title,
      text,
      expression,
      x_range: { min: xMin, max: xMax },
      y_range: { min: yMin, max: yMax },
    };
  } else if (output.response_kind === "explanation") {
    response = {
      kind: "explanation",
      title,
      text,
      ...(items.length > 0 ? { items } : {}),
    };
  } else {
    throw new Error("response_kind is invalid");
  }
  return {
    profile: "octos.selection-enhancement",
    version: "0.1",
    turn_id: input.turn_id,
    created_at: new Date().toISOString(),
    source: structuredClone(input.source),
    interpretation: {
      kind,
      content: nonEmpty("interpretation_content"),
      confidence,
    },
    response,
  };
}

async function generateSelectionEnhancement(
  client: VertexClient,
  input: SelectionToolInput,
): Promise<SelectionEnhancementArtifact> {
  const raw = await callStructuredModel(client, {
    label: "selection-enhancement",
    turnId: input.turn_id,
    maxTokens: Math.min(client.maxTokens, 4_096),
    responseSchema: SELECTION_RESPONSE_SCHEMA,
    systemPrompt: `你是白板选区辅助工具。只解释用户框选的原稿，并在原稿旁边生成独立辅助内容；绝不重写、纠正或替换原稿。recognized_content 是上游视觉模型对选区图片的观察，不是绝对事实；置信度不足时必须明确说明不确定性。只有识别出明确的单变量 y=f(x) 且用户要求函数图像时，response_kind 才能使用 plot，expression 必须是仅含 x 的安全数学表达式。其他情况使用 explanation。不要声称看到了选区以外的白板。`,
    prompt: JSON.stringify({
      learner_request: input.learner_request,
      selected_content_hint: input.content_hint,
      recognized_selected_content: input.recognized_content,
      recognition_confidence: input.recognition_confidence,
      lesson_title: input.lesson_title ?? null,
      board_summary: input.board_summary ?? null,
    }, null, 2),
  });
  return parseSelectionModelResponse(raw, input);
}

function outputPath(input: ToolInput): string {
  const workDirectory = resolve(process.env.OCTOS_WORK_DIR?.trim() || process.cwd());
  const path = resolve(workDirectory, "study", "oll", `${input.turn_id}.octos-lesson.json`);
  if (!path.startsWith(`${workDirectory}${sep}`) || !isAbsolute(path)) {
    throw new Error("Resolved OLL output path escapes OCTOS_WORK_DIR");
  }
  return path;
}

function partialOutputPath(input: ToolInput, part: number): string {
  const workDirectory = resolve(process.env.OCTOS_WORK_DIR?.trim() || process.cwd());
  const suffix = String(part).padStart(3, "0");
  const path = resolve(
    workDirectory,
    "study",
    "oll",
    `${input.turn_id}.part-${suffix}.octos-lesson.json`,
  );
  if (!path.startsWith(`${workDirectory}${sep}`) || !isAbsolute(path)) {
    throw new Error("Resolved partial OLL output path escapes OCTOS_WORK_DIR");
  }
  return path;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, MAX_ERROR_BODY_LENGTH);
  return String(error).slice(0, MAX_ERROR_BODY_LENGTH);
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function emitArtifactProgress(path: string, kind: string, message: string): void {
  process.stderr.write(`${JSON.stringify({ type: "artifact", path, kind, message })}\n`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const invokedTool = process.argv[2];
  try {
    if (invokedTool !== TOOL_NAME && invokedTool !== SELECTION_TOOL_NAME) {
      throw new Error(
        `Unknown tool '${invokedTool ?? ""}'. Expected '${TOOL_NAME}' or '${SELECTION_TOOL_NAME}'`,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const rawInput = Buffer.concat(chunks).toString("utf8");
    if (invokedTool === SELECTION_TOOL_NAME) {
      const input = parseSelectionToolInput(rawInput);
      const client = await createVertexClient();
      const artifact = await generateSelectionEnhancement(client, input);
      const artifactPath = selectionOutputPath(input);
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      stageLog({
        stage: "selection-enhancement",
        turn_id: input.turn_id,
        status: "completed",
        elapsed_ms: Date.now() - startedAt,
      });
      emit({
        success: true,
        output: "Selection enhancement generated without modifying the source ink.",
        files_to_send: [artifactPath],
      });
      return;
    }
    const input = parseToolInput(rawInput);
    const client = await createVertexClient();
    const brief = await planLesson(client, input);
    stageLog({
      stage: "lesson-requirements",
      turn_id: input.turn_id,
      status: "completed",
      elapsed_ms: Date.now() - startedAt,
    });
    const authoringStrategy = process.env.OLL_AUTHORING_STRATEGY?.trim() || "parallel";
    if (authoringStrategy !== "parallel" && authoringStrategy !== "monolithic") {
      throw new Error(`Unknown OLL_AUTHORING_STRATEGY '${authoringStrategy}'`);
    }
    let publishedParts = 0;
    const { lesson, attempts, capabilityPlan, schema } = authoringStrategy === "parallel"
      ? await generateLessonInParallel(client, input, brief, async (prefix, part) => {
          const artifactPath = partialOutputPath(input, part);
          await mkdir(dirname(artifactPath), { recursive: true });
          await writeFile(artifactPath, `${JSON.stringify(prefix, null, 2)}\n`, "utf8");
          publishedParts += 1;
          emitArtifactProgress(
            artifactPath,
            "oll_lesson_part",
            `part=${part} elapsed_ms=${Date.now() - startedAt}`,
          );
        })
      : await generateLesson(client, input, brief);
    const artifactPath = outputPath(input);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(lesson, null, 2)}\n`, "utf8");
    stageLog({
      stage: invokedTool === SELECTION_TOOL_NAME
        ? "selection-enhancement"
        : "lesson-generation",
      turn_id: input.turn_id,
      status: "completed",
      elapsed_ms: Date.now() - startedAt,
    });
    emit({
      success: true,
      output: `Validated OLL lesson generated with ${process.env.OLL_MODEL?.trim() || DEFAULT_MODEL}.`,
      files_to_send: [artifactPath],
      generation_attempts: attempts,
      requirement_items: brief.request_items.length,
      visual_requirements: brief.visual_requirements.length,
      visual_relationships: brief.visual_relationships.length,
      student_tasks: brief.student_task_requirements.length
        + brief.scene3d_task_requirements.length,
      capability_plan: capabilityPlan,
      authoring_schema: schema,
      authoring_strategy: authoringStrategy,
      published_parts: publishedParts,
    });
  } catch (error) {
    const message = safeError(error);
    stageLog({
      stage: "lesson-generation",
      status: "failed",
      elapsed_ms: Date.now() - startedAt,
      error_code: error instanceof ToolExecutionError
        ? error.code
        : invokedTool === SELECTION_TOOL_NAME
          ? "SELECTION_ENHANCEMENT_FAILED"
          : "LESSON_GENERATION_FAILED",
    });
    process.stderr.write(`learning-coach: ${message}\n`);
    emit({
      success: false,
      error_code: error instanceof ToolExecutionError
        ? error.code
        : invokedTool === SELECTION_TOOL_NAME
          ? "SELECTION_ENHANCEMENT_FAILED"
          : "LESSON_GENERATION_FAILED",
      output: message,
    });
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
