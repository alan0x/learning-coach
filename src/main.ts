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
interface VertexServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

class GeneratedLessonError extends Error {
  constructor(message: string, readonly raw?: string) {
    super(message);
    this.name = "GeneratedLessonError";
  }
}

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

必须严格使用以下结构和字段名：
- 根对象：dsl="octos.lesson"、version="0.1"、profile="authoring"、lesson、steps、close。
- steps[]：{ key, purpose, beats }。
- beats[]：{ key, say, delivery, actions }。
- actions[] 使用字段 do；禁止使用 type、create、layout、coordinates。
- 所有 key 与 as 都必须是小写英文别名，只能包含 a-z、0-9、连字符，且必须以字母开头。
- write 必须包含 as、kind、role、content、place；content 必须是对象，place 至少包含 relation。
- 每个 write.content 必须包含非空 text，写出学生在白板上实际能看到的内容；数学公式可同时用 latex，列表可同时用 items，流程可同时用 sequence。不得输出空 content。
- revise 必须包含 target、content、reason；emphasize 必须包含 target、emphasis。
- connect 必须包含 as、from、to、relation；group 必须包含 as、role、label、members。
- focus 必须包含 targets、intent；point 必须包含 target；expression 必须包含 expression。
- 写板书示例：{"do":"write","as":"rule","kind":"note","role":"concept","content":{"title":"规律","items":["内容"]},"place":{"relation":"new_region"}}。
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
  const contentSchema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      title: { type: "string" },
      text: { type: "string" },
      latex: { type: "string" },
      expression: { type: "string" },
      statement: { type: "string" },
      rule: { type: "string" },
      derivation: { type: "string" },
      result: { type: "string" },
      caption: { type: "string" },
      label: { type: "string" },
      items: { type: "array", items: { type: "string" } },
      details: { type: "array", items: { type: "string" } },
      lines: { type: "array", items: { type: "string" } },
      sequence: { type: "array", items: { type: "string" } },
      columns: { type: "array", items: { type: "string" } },
      rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
      },
      fragments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["as"],
          properties: {
            as: { type: "string" },
            text: { type: "string" },
            latex: { type: "string" },
          },
        },
      },
    },
  };
  const definitions = compact.$defs as JsonSchema | undefined;
  const action = definitions?.action as JsonSchema | undefined;
  const actionProperties = action?.properties as JsonSchema | undefined;
  if (definitions && actionProperties) {
    const requiredByAction: Record<string, string[]> = {
      write: ["as", "kind", "role", "content", "place"],
      revise: ["target", "content", "reason"],
      emphasize: ["target", "emphasis"],
      connect: ["as", "from", "to", "relation"],
      group: ["as", "role", "label", "members"],
      focus: ["targets", "intent"],
      point: ["target"],
      expression: ["expression"],
    };
    definitions.action = {
      anyOf: Object.entries(requiredByAction).map(([actionName, requiredFields]) => {
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
                ? structuredClone(contentSchema)
                : structuredClone(actionProperties[propertyName]),
          ])),
        };
      }),
    };
  }
  return compact;
}

const vertexResponseJsonSchema = buildVertexResponseJsonSchema(authoringSchema as JsonSchema);

function validateGeneratedLesson(raw: string, input: ToolInput): AuthoringLesson {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new GeneratedLessonError(`JSON parse failed: ${(error as Error).message}`, raw);
  }

  const schemaResult = validateAuthoringSchema(document);
  if (!schemaResult.valid) {
    const detail = schemaResult.errors
      .slice(0, 8)
      .map((item) => `${item.instancePath || "/"} ${item.message}`)
      .join("; ");
    throw new GeneratedLessonError(`OLL schema validation failed: ${detail}`, raw);
  }

  try {
    validateAuthoringLesson(document as AuthoringLesson, input.session_context ?? { assets: [] });
    const events = normalizeAuthoringLesson(document as AuthoringLesson, {
      lessonId: input.turn_id,
      boardId: "learn-board",
      baseRevision: input.base_revision ?? 0,
      resourceContext: input.session_context ?? { assets: [] },
    });
    reduceCanonicalEvents(events);
  } catch (error) {
    const candidate = error as Error & { code?: string; path?: string };
    const location = candidate.path ? ` at ${candidate.path}` : "";
    const code = candidate.code ? `${candidate.code}: ` : "";
    throw new GeneratedLessonError(`OLL semantic validation failed: ${code}${candidate.message}${location}`, raw);
  }
  return document as AuthoringLesson;
}

function buildGenerationPrompt(input: ToolInput, correction?: string): string {
  const mayUseExistingBoard = input.request_source === "explicit_board_follow_up";
  const context = {
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
  return `请根据以下课堂上下文生成本轮完整课程。只输出 OLL JSON。request_source 已经确定本轮题目的唯一来源：self_contained 只使用 learner_request，current_image 以 source_observation 为权威题面，explicit_board_follow_up 才允许使用 existing_board。不得跨来源替换、补全或改写当前题目。existing_board 为 null 时，必须从 new_region 开始。\n${JSON.stringify(context, null, 2)}${
    correction ? `\n\n上一版无法执行：${correction}\n请重新生成完整对象并修复这些错误。` : ""
  }`;
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

async function callStructuredModel(prompt: string): Promise<string> {
  const account = parseServiceAccount();
  const model = process.env.OLL_MODEL?.trim() || DEFAULT_MODEL;
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || account.project_id;
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
  const timeoutMs = parsePositiveInteger(process.env.OLL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "OLL_TIMEOUT_MS");
  const maxTokens = parsePositiveInteger(process.env.OLL_MAX_TOKENS, DEFAULT_MAX_TOKENS, "OLL_MAX_TOKENS");
  const accessToken = await vertexAccessToken(account, timeoutMs);

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: AUTHORING_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      responseJsonSchema: vertexResponseJsonSchema,
    },
  });
  const requestAttempts = parsePositiveInteger(
    process.env.VERTEX_REQUEST_ATTEMPTS,
    DEFAULT_VERTEX_REQUEST_ATTEMPTS,
    "VERTEX_REQUEST_ATTEMPTS",
  );
  let body = "";
  let status = 0;
  for (let requestAttempt = 1; requestAttempt <= requestAttempts; requestAttempt += 1) {
    const response = await fetch(vertexEndpoint(project, location, model), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
    body = await response.text();
    if (response.ok) break;
    const retryable = status === 429 || status >= 500;
    if (!retryable || requestAttempt === requestAttempts) {
      throw new Error(`Vertex generation failed (${status}): ${body.slice(0, MAX_ERROR_BODY_LENGTH)}`);
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
    process.stderr.write(`learning-coach: raw Vertex payload: ${JSON.stringify(payload).slice(0, 16_000)}\n`);
  }
  return vertexResponseContent(payload);
}

async function generateLesson(input: ToolInput): Promise<AuthoringLesson> {
  let firstFailure: GeneratedLessonError | undefined;
  let correction: string | undefined;
  const maxAttempts = parsePositiveInteger(
    process.env.OLL_GENERATION_ATTEMPTS,
    2,
    "OLL_GENERATION_ATTEMPTS",
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = await callStructuredModel(buildGenerationPrompt(input, correction));
    try {
      return validateGeneratedLesson(raw, input);
    } catch (error) {
      if (!(error instanceof GeneratedLessonError)) throw error;
      if (process.env.OLL_DEBUG_GENERATION === "1") {
        process.stderr.write(`learning-coach: rejected generation ${attempt}: ${raw.slice(0, 16_000)}\n`);
      }
      if (attempt === maxAttempts) {
        throw new Error(`OLL generation failed validation after ${maxAttempts} attempt(s). Last error: ${error.message}`);
      }
      firstFailure = error;
      correction = error.message;
    }
  }
  throw firstFailure ?? new Error("OLL generation failed");
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
    const lesson = await generateLesson(input);
    const artifactPath = outputPath(input);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(lesson, null, 2)}\n`, "utf8");
    emit({
      success: true,
      output: `Validated OLL lesson generated with ${process.env.OLL_MODEL?.trim() || DEFAULT_MODEL}.`,
      files_to_send: [artifactPath],
    });
  } catch (error) {
    const message = safeError(error);
    process.stderr.write(`learning-coach: ${message}\n`);
    emit({ success: false, output: message });
    process.exitCode = 1;
  }
}

void main();
