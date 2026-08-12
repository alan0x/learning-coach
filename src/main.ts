import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { createSign } from "node:crypto";

import authoringSchema from "../references/oll-authoring-v0.1.schema.json" with { type: "json" };
import {
  normalizeAuthoringLesson,
  reduceCanonicalEvents,
  validateAuthoringLesson,
  validateAuthoringSchema,
  type AuthoringLesson,
  type ResourceContext,
} from "../../octos-lesson-language/packages/core/src/index.ts";

const TOOL_NAME = "oll_generate_lesson";
const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_VERTEX_LOCATION = "global";
const DEFAULT_TIMEOUT_MS = 180_000;
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

type JsonSchema = Record<string, unknown>;
type VisualSurface = "geometry" | "plot" | "diagram" | "image" | "table";
type VisualFeature =
  | "coordinate_axes"
  | "equal_scale"
  | "circle"
  | "origin_centered_circle"
  | "unit_radius"
  | "point_on_circle"
  | "radius_segment"
  | "projection_segment"
  | "angle_arc"
  | "function_curve"
  | "annotated_points"
  | "guides"
  | "semantic_elements"
  | "semantic_edges"
  | "source_asset"
  | "tabular_values";

interface VisualRequirement {
  id: string;
  surface: VisualSurface;
  purpose: string;
  evidence: string;
  required_features: VisualFeature[];
  expressions: string[];
}

interface VisualRelationshipRequirement {
  from: string;
  to: string;
  relation: "maps_to" | "compares_with" | "explains" | "derives";
  evidence: string;
}

interface SharedVariableRequirement {
  id: string;
  variable: string;
  purpose: string;
  evidence: string;
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
}

interface LessonBrief {
  version: "1";
  request_summary: string;
  visual_requirements: VisualRequirement[];
  visual_relationships: VisualRelationshipRequirement[];
  shared_variable_requirements: SharedVariableRequirement[];
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
}

interface StructuredModelRequest {
  label: "lesson-brief" | "lesson-authoring";
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

const LESSON_BRIEF_SYSTEM_PROMPT = `你是课堂需求规划器，不生成 OLL，也不撰写课程正文。你的任务是把本轮权威请求转换成一个可验证的 Lesson Brief。

只提取请求明确要求、或完成请求不可缺少的可见教学要求。每项 evidence 必须逐字引用权威请求中的短语，不得引用历史中被隔离的内容。
每个 visual_requirement.id 必须是唯一的小写英文别名，只能包含 a-z、0-9、连字符并以字母开头；visual_relationships 的 from/to 只能引用这些 id。expressions 只用于 plot，其他 surface 必须返回空数组。

视觉 surface：
- geometry：等比例度量几何与坐标几何；
- plot：函数坐标图；
- diagram：语义节点关系图；
- image：受控来源图片；
- table：表格。

通用 feature 的含义：
- coordinate_axes：可读的数值坐标轴；equal_scale：两个坐标方向保持相同比例；
- circle：可度量圆；origin_centered_circle：圆心确实位于坐标原点；unit_radius：半径数值确实为一；
- point_on_circle：点的坐标确实落在圆上；radius_segment：圆心到圆上点的线段；projection_segment：点到坐标轴的实际投影线；angle_arc：非零的可见角弧；
- function_curve：带可执行表达式的函数曲线；annotated_points：有标签的数据点；guides：数值辅助线；
- semantic_elements / semantic_edges：语义节点和语义连线；source_asset：受控图片资源；tabular_values：有行列数据的表格。

如果请求点名某个视觉对象，选择能真实表达它的 surface，并列出让该对象和教学目的在画面上成立所不可缺少的最小 features。不要因为某个 surface 支持一项 feature 就自动要求它；也不要用标题、讲述或标签代替结构特征。

如果请求涉及运动、映射或量的连续变化，规划中必须包含使这个变化可见的结构；例如“旋转角度”需要真实的角度标记，“投影/坐标对应”需要实际投影结构，“函数图像”需要坐标轴和带表达式的曲线。

如果请求要求把两个视觉对象结合、对应、比较或推导，必须在 visual_relationships 中表达；不要把这种关系退化成两张互不相关的图。

shared_variable_requirements 用来规划“同一个量同时驱动多个视觉对象”的课程，不是给每节课机械添加动画：
- 当请求明确要求动画、可交互变化，或教学目标本身是连续运动/变化（例如角度旋转变成周期波动）时，创建 shared_variable_requirement；否则返回空数组。
- variable 是 OLL 变量名；initial/min/max/slider_step/animate_to 使用符合学科含义的数值。转满一圈用 0 到 6.283185307179586，单位用 rad。
- bound_visuals 至少列出所有被同一变量驱动的 visual_requirement.id；跨图对应通常至少有两个。
- direct_angle_geometry 只在某个 geometry 里的点适合由学生直接绕圆心拖动时填写该 visual_requirement.id，否则返回空字符串。
- evidence 仍须逐字引用权威请求；不得因为系统支持动画就凭空规划互动。

没有明确或必要视觉要求时返回空数组。只输出符合 JSON Schema 的 JSON 对象。`;

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

必须严格使用以下结构和字段名：
- 根对象：dsl="octos.lesson"、version="0.1"、profile="authoring"、lesson、steps、close。
- steps[]：{ key, purpose, beats }。
- beats[]：{ key, say, delivery, actions }。
- actions[] 使用字段 do；禁止使用 type、create、layout、coordinates。
- 所有 key 与 as 都必须是小写英文别名，只能包含 a-z、0-9、连字符，且必须以字母开头。
- write 必须包含 as、kind、role、content、place；content 必须是对象，place 至少包含 relation。
- write.content 必须匹配 kind：text/shape 使用非空 text；math 使用 latex；note 使用 title 和 items；table 使用 columns 和 rows；diagram 使用 elements；geometry 使用 axes、points 和几何原语；plot 使用 axes 和 curves；image 使用受控 asset_id。不得用无关的 text 字段代替结构化视觉内容。
- 混合文字与公式的题干或解释使用 kind="text" 或 kind="note"，在 content.text 中只给公式片段加单美元符号（如 $\\sqrt{x-1}$）或 \\(...\\) 定界符；不得把裸 LaTeX 命令直接混入普通文字。
- 以公式为主体的板书使用 kind="math" 并把规范公式写入 content.latex；content.text 只作为可选的可读后备，不要复制带定界符的公式串。
- diagram 只用于语义元素与连线，不得表示圆、角、坐标轴、投影或其他度量几何。geometry 用于等比例坐标系中的圆、点、线段、投影和角弧；axes 必须包含 x/y 数值范围和 equal_scale=true。
- geometry.points[] 每项包含 as、x、y；circles[] 使用 center point alias 和正 radius；segments[] 使用 from/to point alias，投影线使用 style="projection"；arcs[] 使用 center、radius、start_angle、end_angle，角度为弧度。模型不得输出 SVG 或像素坐标。
- diagram 用于语义元素与连线，不得冒充函数图像。plot 用于坐标轴上的函数曲线；content.axes.x/y 各给出数值 min/max，content.curves[] 每项必须包含 as、expression，可包含 label。
- plot.expression 只写受限数学表达式，例如 sin(x)、cos(x)、(x+3)^2-4；支持 x、pi、e、+ - * / ^、括号以及 sin/cos/tan/sqrt/abs/exp/log，不写 y=、LaTeX、代码或 SVG。
- 输入中的 lesson_brief 是本轮请求的可执行要求合同；每个 visual_requirement 和 visual_relationship 都必须由实际白板动作满足，标题、goals、讲述或文字声明不能替代要求的视觉内容。
- lesson_brief.shared_variable_requirements 非空时，必须把每项要求完整落到 OLL：在 lesson.variables 声明唯一变量并提供同一个 slider；在 bound_visuals 对应的 geometry/plot content.bindings 中引用该变量；添加一个 do="animate" 动作；direct_angle_geometry 非空时，在对应 geometry 的可拖动点上声明 interaction={kind:"angle_control",variable,center}。滑杆、动画、直接拖点必须引用同一个变量，禁止复制第二份状态。
- bindings.target 使用“局部元素别名.数值属性”，expression 使用受限表达式并直接引用变量名。例如单位圆与正弦图共享 theta：point-p.x=cos(theta)、point-p.y=sin(theta)、foot.x=cos(theta)、theta-arc.end_angle=theta、current-angle.x=theta、current-angle.y=sin(theta)。
- animate 只描述语义目标，包含 variable、value，可包含 easing 和 duration_intent；不得生成毫秒时长。学生可在 Runtime 中播放、暂停、拖动、复位和重放。
- geometry 点只有在 lesson_brief 指定 direct_angle_geometry 时才添加 angle_control；center 必须引用同一 geometry 中已经定义的圆心点。
- 每个 Beat 的 say 必须使用适合 TTS 朗读的自然语言表达数学关系，不得包含美元符号、反斜杠命令或其他原始 LaTeX 标记。
- revise 必须包含 target、content、reason；emphasize 必须包含 target、emphasis。
- connect 必须包含 as、from、to、relation；group 必须包含 as、role、label、members。
- focus 必须包含 targets、intent；point 必须包含 target；expression 必须包含 expression。
- 写板书示例：{"do":"write","as":"rule","kind":"note","role":"concept","content":{"title":"规律","items":["内容"]},"place":{"relation":"new_region"}}。
- 三角函数图像示例：{"do":"write","as":"trig-curves","kind":"plot","role":"diagram","content":{"axes":{"x":{"min":0,"max":6.283185307179586},"y":{"min":-1.2,"max":1.2}},"curves":[{"as":"sine-curve","expression":"sin(x)","label":"y = sin x"},{"as":"cosine-curve","expression":"cos(x)","label":"y = cos x"}]},"place":{"relation":"new_region"}}。
- 单位圆示例：{"do":"write","as":"unit-circle","kind":"geometry","role":"diagram","content":{"axes":{"x":{"min":-1.25,"max":1.25,"label":"x"},"y":{"min":-1.25,"max":1.25,"label":"y"},"equal_scale":true},"points":[{"as":"origin","x":0,"y":0,"label":"O"},{"as":"point-p","x":0.5,"y":0.8660254,"label":"P(cos θ, sin θ)"},{"as":"foot","x":0.5,"y":0}],"circles":[{"as":"circle","center":"origin","radius":1,"label":"r = 1"}],"segments":[{"as":"radius","from":"origin","to":"point-p","style":"solid"},{"as":"projection","from":"point-p","to":"foot","label":"sin θ","style":"projection"}],"arcs":[{"as":"theta","center":"origin","radius":0.28,"start_angle":0,"end_angle":1.0471975512,"label":"θ"}]},"place":{"relation":"new_region"}}。
- 共享变量示例：lesson.variables=[{"as":"theta","initial":0,"min":0,"max":6.283185307179586,"label":"旋转角 θ","unit":"rad","control":{"kind":"slider","step":0.01}}]；动画动作={"do":"animate","variable":"theta","value":6.283185307179586,"easing":"linear","duration_intent":"extended"}。
- 聚焦示例：{"do":"focus","when":"after_speech","targets":["rule"],"intent":"current_step"}。`;

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

/** Build a compact request-only JSON Schema for Vertex controlled generation.
 * Keep references and conditional action requirements, but remove constraints
 * that add decoder states without affecting the final frozen-schema check. */
function buildVertexResponseJsonSchema(root: JsonSchema): JsonSchema {
  const omitted = new Set([
    "$schema", "$id", "title", "description", "pattern", "format",
    "minimum", "maximum", "minItems", "maxItems",
  ]);
  const convert = (raw: unknown): unknown => {
    if (!raw || typeof raw !== "object") return raw;
    if (Array.isArray(raw)) return raw.map(convert);
    const source = raw as JsonSchema;
    const result: JsonSchema = {};
    for (const [key, value] of Object.entries(source)) {
      if (omitted.has(key) && (value === null || typeof value !== "object")) continue;
      if (key === "const") {
        result.enum = [value];
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
      properties: { x: geometryAxis, y: geometryAxis, equal_scale: { enum: [true] } },
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
    const reviseContent = {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" }, text: { type: "string" }, latex: { type: "string" },
        caption: { type: "string" }, items: stringArray, columns: stringArray,
        rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        fragments, elements: diagramElements, edges: diagramEdges, regions: diagramRegions,
        axes: { anyOf: [structuredClone(axes), structuredClone(geometryAxes)] },
        curves, points, guides,
        circles: geometryCircles, segments: geometrySegments, arcs: geometryArcs,
        bindings,
      },
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

function requireNonEmptyCollection(contentSchema: JsonSchema, field: string): void {
  const required = Array.isArray(contentSchema.required) ? contentSchema.required as string[] : [];
  if (!required.includes(field)) contentSchema.required = [...required, field];
  const properties = contentSchema.properties as JsonSchema | undefined;
  const collection = properties?.[field] as JsonSchema | undefined;
  if (collection?.type === "array") collection.minItems = 1;
}

/** Lower the generic Lesson Brief feature contract into this request's controlled-decoding schema.
 * This remains topic-agnostic: it only maps OLL capabilities to the collections that realize them. */
function buildAuthoringResponseJsonSchema(brief: LessonBrief): JsonSchema {
  const schema = structuredClone(vertexResponseJsonSchema);
  const definitions = schema.$defs as JsonSchema | undefined;
  const action = definitions?.action as JsonSchema | undefined;
  const variants = Array.isArray(action?.anyOf) ? action.anyOf as JsonSchema[] : [];
  const fieldsBySurface: Partial<Record<VisualSurface, Map<VisualFeature, string>>> = {
    geometry: new Map([
      ["circle", "circles"], ["origin_centered_circle", "circles"], ["unit_radius", "circles"],
      ["radius_segment", "segments"], ["projection_segment", "segments"], ["angle_arc", "arcs"],
    ]),
    plot: new Map([["annotated_points", "points"], ["guides", "guides"]]),
    diagram: new Map([["semantic_edges", "edges"]]),
  };
  for (const surface of visualSurfaces) {
    const requirements = brief.visual_requirements.filter((item) => item.surface === surface);
    if (requirements.length === 0) continue;
    const variant = variants.find((item) => {
      const properties = item.properties as JsonSchema | undefined;
      const kind = properties?.kind as JsonSchema | undefined;
      return Array.isArray(kind?.enum) && kind.enum[0] === surface;
    });
    const properties = variant?.properties as JsonSchema | undefined;
    const content = properties?.content as JsonSchema | undefined;
    if (!content) continue;
    for (const requirement of requirements) {
      for (const feature of requirement.required_features) {
        const field = fieldsBySurface[surface]?.get(feature);
        if (field) requireNonEmptyCollection(content, field);
      }
    }
  }
  if (brief.shared_variable_requirements.length > 0) {
    const rootProperties = schema.properties as JsonSchema;
    const lesson = rootProperties.lesson as JsonSchema;
    const lessonRequired = Array.isArray(lesson.required) ? lesson.required as string[] : [];
    if (!lessonRequired.includes("variables")) lesson.required = [...lessonRequired, "variables"];
    const lessonProperties = lesson.properties as JsonSchema;
    const variables = lessonProperties.variables as JsonSchema;
    variables.minItems = brief.shared_variable_requirements.length;

    const boundSurfaces = new Set(brief.shared_variable_requirements.flatMap((requirement) =>
      requirement.bound_visuals.flatMap((id) => {
        const visual = brief.visual_requirements.find((candidate) => candidate.id === id);
        return visual ? [visual.surface] : [];
      })));
    for (const surface of ["geometry", "plot"] as const) {
      if (!boundSurfaces.has(surface)) continue;
      const variant = variants.find((item) => {
        const properties = item.properties as JsonSchema | undefined;
        const kind = properties?.kind as JsonSchema | undefined;
        return Array.isArray(kind?.enum) && kind.enum[0] === surface;
      });
      const content = (variant?.properties as JsonSchema | undefined)?.content as JsonSchema | undefined;
      if (content) requireNonEmptyCollection(content, "bindings");
    }
  }
  return schema;
}

const visualSurfaces: VisualSurface[] = ["geometry", "plot", "diagram", "image", "table"];
const visualFeatures: VisualFeature[] = [
  "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
  "point_on_circle", "radius_segment", "projection_segment", "angle_arc", "function_curve",
  "annotated_points", "guides", "semantic_elements", "semantic_edges", "source_asset",
  "tabular_values",
];
const visualRelationships: VisualRelationshipRequirement["relation"][] = [
  "maps_to", "compares_with", "explains", "derives",
];
const animationEasings: SharedVariableRequirement["easing"][] = ["linear", "ease_in_out"];
const animationDurationIntents: SharedVariableRequirement["duration_intent"][] = [
  "brief", "normal", "extended",
];

const lessonBriefResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "request_summary", "visual_requirements", "visual_relationships",
    "shared_variable_requirements",
  ],
  properties: {
    version: { enum: ["1"] },
    request_summary: { type: "string" },
    visual_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "surface", "purpose", "evidence", "required_features", "expressions"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          surface: { enum: visualSurfaces },
          purpose: { type: "string" },
          evidence: { type: "string" },
          required_features: { type: "array", items: { enum: visualFeatures } },
          expressions: { type: "array", items: { type: "string" } },
        },
      },
    },
    visual_relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "relation", "evidence"],
        properties: {
          from: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          to: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          relation: { enum: visualRelationships },
          evidence: { type: "string" },
        },
      },
    },
    shared_variable_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "variable", "purpose", "evidence", "initial", "min", "max", "label", "unit",
          "slider_step", "animate_to", "easing", "duration_intent", "bound_visuals",
          "direct_angle_geometry",
        ],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          variable: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          purpose: { type: "string" },
          evidence: { type: "string" },
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
            items: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          },
          direct_angle_geometry: { type: "string" },
        },
      },
    },
  },
};

const featuresBySurface: Record<VisualSurface, ReadonlySet<VisualFeature>> = {
  geometry: new Set([
    "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
    "point_on_circle", "radius_segment", "projection_segment", "angle_arc", "annotated_points",
  ]),
  plot: new Set(["coordinate_axes", "function_curve", "annotated_points", "guides"]),
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

function authoritativeRequestText(input: ToolInput): string[] {
  const sources = [input.learner_request];
  if (input.request_source === "current_image" && input.source_observation) {
    sources.push(input.source_observation.recognized_problem);
  }
  if (input.request_source === "explicit_board_follow_up" && input.board_summary) {
    sources.push(input.board_summary);
  }
  return sources;
}

function briefViolation(code: string, path: string, message: string): GenerationViolation {
  return { stage: "brief", code, path, message };
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
  const ids = new Set<string>();
  const authoritative = authoritativeRequestText(input).map(normalizeEvidence);
  const grounded = (evidence: unknown) => typeof evidence === "string"
    && normalizeEvidence(evidence).length > 0
    && authoritative.some((source) => source.includes(normalizeEvidence(evidence)));

  requirements.forEach((raw, index) => {
    const path = `/visual_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_REQUIREMENT", path, "requirement must be an object"));
      return;
    }
    if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.id) || ids.has(raw.id)) {
      violations.push(briefViolation("BRIEF_INVALID_ID", `${path}/id`, "id must be a unique lowercase alias"));
    } else {
      ids.add(raw.id);
    }
    if (!visualSurfaces.includes(raw.surface as VisualSurface)) {
      violations.push(briefViolation("BRIEF_INVALID_SURFACE", `${path}/surface`, "surface is unsupported"));
    }
    if (typeof raw.purpose !== "string" || !raw.purpose.trim()) {
      violations.push(briefViolation("BRIEF_MISSING_PURPOSE", `${path}/purpose`, "purpose is required"));
    }
    if (!grounded(raw.evidence)) {
      violations.push(briefViolation("BRIEF_UNGROUNDED_EVIDENCE", `${path}/evidence`, "evidence must quote an authoritative request source"));
    }
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
    } else if (raw.expressions.length > 0 && raw.surface !== "plot") {
      violations.push(briefViolation("BRIEF_INCOMPATIBLE_EXPRESSIONS", `${path}/expressions`, "expressions are supported only by plot requirements"));
    }
  });

  relationships.forEach((raw, index) => {
    const path = `/visual_relationships/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_RELATIONSHIP", path, "relationship must be an object"));
      return;
    }
    if (typeof raw.from !== "string" || !ids.has(raw.from)) {
      violations.push(briefViolation("BRIEF_UNKNOWN_RELATION_SOURCE", `${path}/from`, "from must reference a visual requirement id"));
    }
    if (typeof raw.to !== "string" || !ids.has(raw.to)) {
      violations.push(briefViolation("BRIEF_UNKNOWN_RELATION_TARGET", `${path}/to`, "to must reference a visual requirement id"));
    }
    if (!visualRelationships.includes(raw.relation as VisualRelationshipRequirement["relation"])) {
      violations.push(briefViolation("BRIEF_INVALID_RELATION", `${path}/relation`, "relation is unsupported"));
    }
    if (!grounded(raw.evidence)) {
      violations.push(briefViolation("BRIEF_UNGROUNDED_EVIDENCE", `${path}/evidence`, "evidence must quote an authoritative request source"));
    }
  });

  const visualById = new Map(requirements.flatMap((raw) => isRecord(raw) && typeof raw.id === "string"
    ? [[raw.id, raw] as const]
    : []));
  const sharedIds = new Set<string>();
  const variableNames = new Set<string>();
  sharedVariables.forEach((raw, index) => {
    const path = `/shared_variable_requirements/${index}`;
    if (!isRecord(raw)) {
      violations.push(briefViolation("BRIEF_INVALID_SHARED_VARIABLE", path, "shared variable requirement must be an object"));
      return;
    }
    if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.id) || sharedIds.has(raw.id)) {
      violations.push(briefViolation("BRIEF_INVALID_SHARED_VARIABLE_ID", `${path}/id`, "id must be a unique lowercase alias"));
    } else {
      sharedIds.add(raw.id);
    }
    if (typeof raw.variable !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(raw.variable)
      || variableNames.has(raw.variable)) {
      violations.push(briefViolation("BRIEF_INVALID_VARIABLE_NAME", `${path}/variable`, "variable must be a unique OLL variable alias"));
    } else {
      variableNames.add(raw.variable);
    }
    if (typeof raw.purpose !== "string" || !raw.purpose.trim()) {
      violations.push(briefViolation("BRIEF_MISSING_VARIABLE_PURPOSE", `${path}/purpose`, "purpose is required"));
    }
    if (!grounded(raw.evidence)) {
      violations.push(briefViolation("BRIEF_UNGROUNDED_EVIDENCE", `${path}/evidence`, "evidence must quote an authoritative request source"));
    }
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
        if (visual.surface !== "geometry" && visual.surface !== "plot") {
          violations.push(briefViolation("BRIEF_UNSUPPORTED_BOUND_VISUAL", `${path}/bound_visuals`, "shared variables currently bind only geometry and plot visuals"));
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
      }
    }
  });

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
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/^y\s*=/u, "")
    .replace(/\s+/gu, "");
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

function validateBriefCoverage(document: AuthoringLesson, brief: LessonBrief): GenerationViolation[] {
  const inventory = buildVisualInventory(document);
  const matched = new Map<string, VisualInventoryEntry>();
  const violations: GenerationViolation[] = [];
  for (const requirement of brief.visual_requirements) {
    const candidates = inventory.nodes.filter((node) => node.surface === requirement.surface);
    const scored = candidates.map((node) => {
      const missingFeatures = requirement.required_features.filter((feature) => !node.features.has(feature));
      const actualExpressions = node.expressions.map(normalizeExpression);
      const missingExpressions = requirement.expressions.filter(
        (expression) => !actualExpressions.includes(normalizeExpression(expression)),
      );
      return { node, missingFeatures, missingExpressions };
    }).sort((left, right) => (left.missingFeatures.length + left.missingExpressions.length)
      - (right.missingFeatures.length + right.missingExpressions.length));
    const best = scored[0];
    if (best && best.missingFeatures.length === 0 && best.missingExpressions.length === 0) {
      matched.set(requirement.id, best.node);
      continue;
    }
    const nearest = best ? ` Closest ${requirement.surface} node is '${best.node.alias}'.` : "";
    violations.push({
      stage: "request_coverage",
      code: "OLL_VISUAL_REQUIREMENT_UNSATISFIED",
      path: "/steps",
      requirement_id: requirement.id,
      message: `Visual requirement '${requirement.id}' (${requirement.surface}) is not satisfied.${nearest}`,
      missing_features: best?.missingFeatures ?? requirement.required_features,
      missing_expressions: best?.missingExpressions ?? requirement.expressions,
    });
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
  return violations;
}

function validateGeneratedLesson(raw: string, input: ToolInput, brief: LessonBrief): AuthoringLesson {
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

  const schemaResult = validateAuthoringSchema(document);
  if (!schemaResult.valid) {
    const violations = schemaResult.errors.slice(0, 8).map((item): GenerationViolation => ({
      stage: "schema",
      code: "OLL_SCHEMA_VALIDATION_FAILED",
      path: item.instancePath || "/",
      message: item.message || "Schema validation failed",
    }));
    throw new GeneratedLessonError(`OLL schema validation failed: ${formatViolations(violations)}`, raw, violations);
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
  violations.push(...validateBriefCoverage(lesson, brief));
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
    throw new GeneratedLessonError(`OLL validation failed: ${formatViolations(violations)}`, raw, violations);
  }
  return lesson;
}

function buildRequestContext(input: ToolInput): Record<string, unknown> {
  const mayUseExistingBoard = input.request_source === "explicit_board_follow_up";
  return {
    learner_request: input.learner_request,
    request_source: input.request_source,
    source_observation: input.source_observation ?? null,
    language: input.language ?? "zh-CN",
    tutor_context: input.tutor_context ?? "耐心、具体、连续讲解",
    learner_context: input.learner_context ?? null,
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
    ? `\n\n上一份 Lesson Brief：\n${previousBrief}\n\n精确校验错误：\n${JSON.stringify(violations, null, 2)}\n保留已正确且有 evidence 的要求，只修复这些错误并返回完整对象。`
    : "";
  return `请把以下权威课堂请求转换成 Lesson Brief。request_source 决定唯一题目来源；不得使用 existing_board 为 self_contained 或 current_image 补题。\n${JSON.stringify(buildRequestContext(input), null, 2)}${repair}`;
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
  previousCandidate?: string,
  violations: GenerationViolation[] = [],
): string {
  const repair = previousCandidate
    ? `\n\n上一份候选 OLL（必须保留其中已正确的教学内容与白板动作）：\n${compactCandidate(previousCandidate)}\n\n精确校验错误：\n${JSON.stringify(violations, null, 2)}\n只针对这些 violation 修复，返回完整 OLL 对象。`
    : "";
  return `请根据以下课堂上下文和 Lesson Brief 生成本轮完整课程。只输出 OLL JSON。request_source 已经确定本轮题目的唯一来源：self_contained 只使用 learner_request，current_image 以 source_observation 为权威题面，explicit_board_follow_up 才允许使用 existing_board。不得跨来源替换、补全或改写当前题目。existing_board 为 null 时，必须从 new_region 开始。\n课堂上下文：\n${JSON.stringify(buildRequestContext(input), null, 2)}\n\nlesson_brief：\n${JSON.stringify(brief, null, 2)}${repair}`;
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
  if (candidate.finishReason === "MAX_TOKENS") throw new Error("Vertex response was truncated at maxOutputTokens");
  const text = candidate.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error(`Vertex response contains no JSON text (finishReason=${candidate.finishReason ?? "unknown"})`);
  return text;
}

async function createVertexClient(): Promise<VertexClient> {
  const account = parseServiceAccount();
  const model = process.env.OLL_MODEL?.trim() || DEFAULT_MODEL;
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || account.project_id;
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
  const timeoutMs = parsePositiveInteger(process.env.OLL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "OLL_TIMEOUT_MS");
  const maxTokens = parsePositiveInteger(process.env.OLL_MAX_TOKENS, DEFAULT_MAX_TOKENS, "OLL_MAX_TOKENS");
  const accessToken = await vertexAccessToken(account, timeoutMs);
  return {
    endpoint: vertexEndpoint(project, location, model),
    accessToken,
    timeoutMs,
    maxTokens,
    requestAttempts: parsePositiveInteger(
      process.env.VERTEX_REQUEST_ATTEMPTS,
      DEFAULT_VERTEX_REQUEST_ATTEMPTS,
      "VERTEX_REQUEST_ATTEMPTS",
    ),
  };
}

async function callStructuredModel(client: VertexClient, request: StructuredModelRequest): Promise<string> {
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
  for (let requestAttempt = 1; requestAttempt <= client.requestAttempts; requestAttempt += 1) {
    const response = await fetch(client.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${client.accessToken}`,
        "content-type": "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(client.timeoutMs),
    });
    status = response.status;
    body = await response.text();
    if (response.ok) break;
    const retryable = status === 429 || status >= 500;
    if (!retryable || requestAttempt === client.requestAttempts) {
      throw new Error(`Vertex ${request.label} failed (${status}): ${body.slice(0, MAX_ERROR_BODY_LENGTH)}`);
    }
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 10_000)
      : Math.min(1_000 * 2 ** (requestAttempt - 1), 4_000);
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
  return vertexResponseContent(payload);
}

async function planLesson(client: VertexClient, input: ToolInput): Promise<LessonBrief> {
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_PLANNING_ATTEMPTS,
    2,
    "OLL_PLANNING_ATTEMPTS",
  );
  let previousBrief: string | undefined;
  let violations: GenerationViolation[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await callStructuredModel(client, {
      label: "lesson-brief",
      systemPrompt: LESSON_BRIEF_SYSTEM_PROMPT,
      prompt: buildPlanningPrompt(input, previousBrief, violations),
      responseSchema: lessonBriefResponseJsonSchema,
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
      return validateLessonBrief(candidate, input);
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

async function generateLesson(
  client: VertexClient,
  input: ToolInput,
  brief: LessonBrief,
): Promise<{ lesson: AuthoringLesson; attempts: number }> {
  let previousCandidate: string | undefined;
  let violations: GenerationViolation[] = [];
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_GENERATION_ATTEMPTS,
    2,
    "OLL_GENERATION_ATTEMPTS",
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await callStructuredModel(client, {
      label: "lesson-authoring",
      systemPrompt: AUTHORING_SYSTEM_PROMPT,
      prompt: buildGenerationPrompt(input, brief, previousCandidate, violations),
      responseSchema: buildAuthoringResponseJsonSchema(brief),
    });
    try {
      return { lesson: validateGeneratedLesson(raw, input, brief), attempts: attempt };
    } catch (error) {
      if (!(error instanceof GeneratedLessonError)) throw error;
      process.stderr.write(`learning-coach: rejected lesson generation ${attempt}: ${formatViolations(error.violations)}\n`);
      if (process.env.OLL_DEBUG_GENERATION === "1") {
        process.stderr.write(`learning-coach: rejected generation ${attempt}: ${raw.slice(0, 16_000)}\n`);
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

function outputPath(input: ToolInput): string {
  const workDirectory = resolve(process.env.OCTOS_WORK_DIR?.trim() || process.cwd());
  const path = resolve(workDirectory, "study", "oll", `${input.turn_id}.octos-lesson.json`);
  if (!path.startsWith(`${workDirectory}${sep}`) || !isAbsolute(path)) {
    throw new Error("Resolved OLL output path escapes OCTOS_WORK_DIR");
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

async function main(): Promise<void> {
  try {
    if (process.argv[2] !== TOOL_NAME) {
      throw new Error(`Unknown tool '${process.argv[2] ?? ""}'. Expected '${TOOL_NAME}'`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const input = parseToolInput(Buffer.concat(chunks).toString("utf8"));
    const client = await createVertexClient();
    const brief = await planLesson(client, input);
    const { lesson, attempts } = await generateLesson(client, input, brief);
    const artifactPath = outputPath(input);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(lesson, null, 2)}\n`, "utf8");
    emit({
      success: true,
      output: `Validated OLL lesson generated with ${process.env.OLL_MODEL?.trim() || DEFAULT_MODEL}.`,
      files_to_send: [artifactPath],
      generation_attempts: attempts,
      visual_requirements: brief.visual_requirements.length,
      visual_relationships: brief.visual_relationships.length,
    });
  } catch (error) {
    const message = safeError(error);
    process.stderr.write(`learning-coach: ${message}\n`);
    emit({ success: false, output: message });
    process.exitCode = 1;
  }
}

void main();
