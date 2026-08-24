import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, createSign } from "node:crypto";

import {
  compileMathExpression,
  type AuthoringLesson,
} from "octos-lesson-language";

const TOOL_NAME = "oll_generate_lesson";
const SELECTION_TOOL_NAME = "oll_enhance_selection";
const SELECTION_CLASSIFICATION_TOOL_NAME = "oll_classify_selection";
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_VERTEX_LOCATION = "global";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 270_000;
const DEFAULT_MAX_TOKENS = 32_768;
const DEFAULT_VERTEX_REQUEST_ATTEMPTS = 3;
const MAX_CONTEXT_LENGTH = 24_000;
const MAX_ERROR_BODY_LENGTH = 4_000;

interface ToolInput {
  turn_id: string;
  learner_request: string;
  request_source: "self_contained";
  language?: string;
  tutor_context?: string;
  learner_context?: string;
  input_modality?: "text" | "voice";
}

type SelectionContentKind = "text" | "math" | "geometry" | "data" | "unknown";
type SelectionToolId = "explain" | "check-and-suggest" | "generate-plot" | "custom-question";

interface SelectionBoardTargetRef {
  target_id: string;
  node_id: string;
  element_id?: string;
  kind: string;
  label?: string;
  value?: unknown;
  world_bounds: { x: number; y: number; width: number; height: number };
  overlap: number;
  distance: number;
  z_index: number;
}

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
  tool_id: SelectionToolId;
  board: {
    board_id: string;
    revision: number;
    targets: SelectionBoardTargetRef[];
  };
  selection_media?: string;
  recognized_content?: string;
  recognition_confidence?: "high" | "medium" | "low";
  lesson_title?: string;
  board_summary?: string;
}

interface SelectionClassification {
  kind: SelectionContentKind;
  content: string;
  confidence: "high" | "medium" | "low";
}

interface SelectionEnhancementArtifact {
  profile: "octos.selection-enhancement";
  version: "0.2";
  turn_id: string;
  created_at: string;
  source: SelectionToolInput["source"];
  board: SelectionToolInput["board"];
  tool_id: SelectionToolId;
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
        plot_kind?: "explicit" | "implicit";
        level?: number;
        samples?: number;
        x_range: { min: number; max: number };
        y_range: { min: number; max: number };
      }
    | {
        kind: "scene3d";
        title: string;
        text: string;
        content: {
          title: string;
          fallback: string;
          axes: boolean;
          camera: { yaw: number; pitch: number; zoom: number };
          objects: Array<Record<string, unknown>>;
        };
      }
    | {
        kind: "unsupported";
        title: string;
        text: string;
        reason_code:
          | "unreadable_expression"
          | "unsupported_variables"
          | "unsupported_representation"
          | "unsafe_complexity";
        alternatives?: string[];
      };
}

type JsonSchema = Record<string, unknown>;
interface VertexServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface VertexClient {
  endpoint: string;
  model: string;
  accessToken: string;
  timeoutMs: number;
  maxTokens: number;
  requestAttempts: number;
  deadlineAt?: number;
}

type ThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";

export interface StructuredModelRequest {
  label:
    | "lesson-plan-bootstrap"
    | "lesson-plan-outline"
    | "lesson-plan-section"
    | "selection-enhancement"
    | "selection-classification";
  turnId: string;
  systemPrompt: string;
  prompt: string;
  /**
   * Provider-side JSON grammar. Omit only for controlled evaluation of
   * Vertex JSON mode; all generated values still pass the same local Lesson
   * Plan/OLL validators before they can reach the runtime.
   */
  responseSchema?: JsonSchema;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
  media?: { mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string };
  lessonPlanPart?: "bootstrap" | "outline" | "section";
  lessonPlanSection?: number;
  lessonPlanAttempt?: number;
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

function parseThinkingLevel(value: string | undefined, label: string): ThinkingLevel | undefined {
  if (!value?.trim()) return undefined;
  const level = value.trim().toUpperCase();
  if (level !== "MINIMAL" && level !== "LOW" && level !== "MEDIUM" && level !== "HIGH") {
    throw new Error(`${label} must be MINIMAL, LOW, MEDIUM, or HIGH`);
  }
  return level;
}

function configuredThinkingLevel(
  label: StructuredModelRequest["label"],
): ThinkingLevel | undefined {
  const environmentName = label === "lesson-plan-bootstrap"
    || label === "lesson-plan-outline"
    ? "OLL_TASK_THINKING_LEVEL"
    : label === "lesson-plan-section"
      ? "OLL_SECTION_THINKING_LEVEL"
      : label === "selection-enhancement"
        ? "OLL_SELECTION_THINKING_LEVEL"
        : "OLL_SELECTION_CLASSIFICATION_THINKING_LEVEL";
  const safeDefault: ThinkingLevel = "LOW";
  return parseThinkingLevel(process.env[environmentName], environmentName)
    ?? parseThinkingLevel(process.env.OLL_THINKING_LEVEL, "OLL_THINKING_LEVEL")
    ?? safeDefault;
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

function parseCompleteLessonInput(raw: string): ToolInput {
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
  if (input.request_source !== "self_contained") {
    throw new ToolExecutionError(
      "LESSON_REQUEST_SOURCE_UNSUPPORTED",
      "Complete lesson generation accepts self_contained requests only",
    );
  }
  const allowedFields = new Set([
    "turn_id",
    "learner_request",
    "request_source",
    "language",
    "tutor_context",
    "learner_context",
    "input_modality",
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      throw new ToolExecutionError(
        "LESSON_INPUT_FIELD_UNSUPPORTED",
        `Complete lesson input does not accept '${field}'`,
      );
    }
  }
  if (input.input_modality !== undefined
    && input.input_modality !== "text"
    && input.input_modality !== "voice") {
    throw new ToolExecutionError(
      "LESSON_INPUT_MODALITY_UNSUPPORTED",
      "input_modality must be text or voice",
    );
  }
  return {
    turn_id: validateTurnId(input.turn_id),
    learner_request: requireNonEmptyString(input.learner_request, "learner_request"),
    request_source: "self_contained",
    ...(typeof input.language === "string" ? { language: truncate(input.language) } : {}),
    ...(typeof input.tutor_context === "string"
      ? { tutor_context: truncate(input.tutor_context) }
      : {}),
    ...(typeof input.learner_context === "string"
      ? { learner_context: truncate(input.learner_context) }
      : {}),
    input_modality: input.input_modality === "voice" ? "voice" : "text",
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
  if (confidence !== undefined && !["high", "medium", "low"].includes(String(confidence))) {
    throw new Error("recognition_confidence is invalid");
  }
  const selectionMedia = typeof input.selection_media === "string" && input.selection_media.trim()
    ? input.selection_media.trim()
    : undefined;
  const recognizedContent = typeof input.recognized_content === "string" && input.recognized_content.trim()
    ? truncate(input.recognized_content.trim())
    : undefined;
  if (!selectionMedia && !recognizedContent) {
    throw new Error("selection_media or recognized_content is required");
  }
  const toolId = input.tool_id;
  if (!["explain", "check-and-suggest", "generate-plot", "custom-question"].includes(
    String(toolId),
  )) {
    throw new Error("tool_id is invalid");
  }
  if (toolId === "generate-plot" && contentHint !== "math") {
    throw new Error("generate-plot requires content_hint=math");
  }
  const boardValue = input.board;
  if (!boardValue || typeof boardValue !== "object" || Array.isArray(boardValue)) {
    throw new Error("board must be an object");
  }
  const board = boardValue as Record<string, unknown>;
  const revision = board.revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
    throw new Error("board.revision must be a non-negative integer");
  }
  if (!Array.isArray(board.targets) || board.targets.length > 6) {
    throw new Error("board.targets must contain at most 6 targets");
  }
  const targetIds = new Set<string>();
  const targets = board.targets.map((value, index): SelectionBoardTargetRef => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`board.targets[${index}] must be an object`);
    }
    const target = value as Record<string, unknown>;
    const targetId = requireNonEmptyString(
      target.target_id,
      `board.targets[${index}].target_id`,
    );
    if (targetIds.has(targetId)) throw new Error("board.targets contains duplicate target_id");
    targetIds.add(targetId);
    if (!target.world_bounds || typeof target.world_bounds !== "object"
      || Array.isArray(target.world_bounds)) {
      throw new Error(`board.targets[${index}].world_bounds must be an object`);
    }
    const worldBounds = target.world_bounds as Record<string, unknown>;
    const worldWidth = finite(worldBounds.width, `board.targets[${index}].world_bounds.width`);
    const worldHeight = finite(worldBounds.height, `board.targets[${index}].world_bounds.height`);
    if (worldWidth <= 0 || worldHeight <= 0) {
      throw new Error(`board.targets[${index}].world_bounds must have positive dimensions`);
    }
    const overlap = finite(target.overlap, `board.targets[${index}].overlap`);
    if (overlap < 0 || overlap > 1) {
      throw new Error(`board.targets[${index}].overlap must be between 0 and 1`);
    }
    const distance = finite(target.distance, `board.targets[${index}].distance`);
    if (distance < 0) throw new Error(`board.targets[${index}].distance must be non-negative`);
    if (!Number.isSafeInteger(target.z_index)) {
      throw new Error(`board.targets[${index}].z_index must be an integer`);
    }
    let structuredValue: unknown;
    if (target.value_json !== undefined) {
      const valueJson = requireNonEmptyString(
        target.value_json,
        `board.targets[${index}].value_json`,
      );
      if (valueJson.length > 2_000) {
        throw new Error(`board.targets[${index}].value_json is too long`);
      }
      try {
        structuredValue = JSON.parse(valueJson);
      } catch {
        throw new Error(`board.targets[${index}].value_json must be valid JSON`);
      }
    }
    return {
      target_id: targetId,
      node_id: requireNonEmptyString(
        target.node_id,
        `board.targets[${index}].node_id`,
      ),
      ...(typeof target.element_id === "string" && target.element_id.trim()
        ? { element_id: target.element_id.trim() }
        : {}),
      kind: requireNonEmptyString(target.kind, `board.targets[${index}].kind`),
      ...(typeof target.label === "string" && target.label.trim()
        ? { label: truncate(target.label)! }
        : {}),
      ...(structuredValue === undefined ? {} : { value: structuredValue }),
      world_bounds: {
        x: finite(worldBounds.x, `board.targets[${index}].world_bounds.x`),
        y: finite(worldBounds.y, `board.targets[${index}].world_bounds.y`),
        width: worldWidth,
        height: worldHeight,
      },
      overlap,
      distance,
      z_index: Number(target.z_index),
    };
  });
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
    tool_id: toolId as SelectionToolId,
    board: {
      board_id: requireNonEmptyString(board.board_id, "board.board_id"),
      revision: Number(revision),
      targets,
    },
    ...(selectionMedia ? { selection_media: selectionMedia } : {}),
    ...(recognizedContent ? { recognized_content: recognizedContent } : {}),
    ...(confidence ? { recognition_confidence: confidence as "high" | "medium" | "low" } : {}),
    ...(typeof input.lesson_title === "string"
      ? { lesson_title: truncate(input.lesson_title) }
      : {}),
    ...(typeof input.board_summary === "string"
      ? { board_summary: truncate(input.board_summary) }
      : {}),
  };
}

function parseSelectionClassificationInput(raw: string): SelectionToolInput {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Tool input is not valid JSON: ${(error as Error).message}`);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Selection classification input must be a JSON object");
  }
  const input = parseSelectionToolInput(JSON.stringify({
    ...(candidate as Record<string, unknown>),
    learner_request: "Classify only the selected student ink.",
    content_hint: "unknown",
    tool_id: "custom-question",
  }));
  if (!input.selection_media) {
    throw new Error("selection_media is required for selection classification");
  }
  return input;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  if (!text) {
    throw new ToolExecutionError(
      "VERTEX_RESPONSE_EMPTY",
      `Vertex response contains no JSON text (finishReason=${candidate.finishReason ?? "unknown"})`,
    );
  }
  return text;
}

export async function createVertexClient(): Promise<VertexClient> {
  const hostAccessToken = process.env.VERTEX_ACCESS_TOKEN?.trim();
  const account = hostAccessToken ? undefined : parseServiceAccount();
  const model = process.env.OLL_MODEL?.trim() || DEFAULT_MODEL;
  const project = requireNonEmptyString(
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || account?.project_id,
    "GOOGLE_CLOUD_PROJECT",
  );
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
    accessToken = hostAccessToken
      ? hostAccessToken
      : await vertexAccessToken(account!, Math.min(timeoutMs, totalTimeoutMs));
    stageLog({
      stage: "vertex-auth",
      status: "completed",
      elapsed_ms: Date.now() - authStartedAt,
      source: hostAccessToken ? "host_token" : "service_account_exchange",
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
    model,
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

interface ActiveStageTrace {
  path: string;
  turnId: string;
  invokedTool: string;
  startedAt: number;
  sequence: number;
}

let activeStageTrace: ActiveStageTrace | undefined;

function stageTracePath(turnId: string): string {
  const workDirectory = resolve(process.env.OCTOS_WORK_DIR?.trim() || process.cwd());
  const path = resolve(workDirectory, "study", "oll", `${turnId}.generation-trace.jsonl`);
  if (!path.startsWith(`${workDirectory}${sep}`) || !isAbsolute(path)) {
    throw new Error("Resolved generation trace path escapes OCTOS_WORK_DIR");
  }
  return path;
}

function beginStageTrace(turnId: string, invokedTool: string, startedAt: number): void {
  const path = stageTracePath(turnId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "", "utf8");
  activeStageTrace = { path, turnId, invokedTool, startedAt, sequence: 0 };
  stageLog({
    stage: "tool-invocation",
    turn_id: turnId,
    tool: invokedTool,
    status: "started",
  });
}

function traceTurnIdFromRawInput(rawInput: string): string | undefined {
  try {
    const candidate = JSON.parse(rawInput) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    return validateTurnId((candidate as Record<string, unknown>).turn_id);
  } catch {
    return undefined;
  }
}

function stageLog(payload: Record<string, unknown>): void {
  const trace = activeStageTrace;
  const normalizedPayload = trace && payload.turn_id === undefined
    ? { ...payload, turn_id: trace.turnId }
    : payload;
  process.stderr.write(`learning-coach: ${JSON.stringify(normalizedPayload)}\n`);
  if (!trace) return;
  trace.sequence += 1;
  const entry = {
    schema: "octos.learning-coach.generation-stage.v1",
    sequence: trace.sequence,
    recorded_at: new Date().toISOString(),
    invocation_elapsed_ms: Date.now() - trace.startedAt,
    tool: trace.invokedTool,
    ...normalizedPayload,
  };
  try {
    appendFileSync(trace.path, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    process.stderr.write(`learning-coach: ${JSON.stringify({
      stage: "generation-trace",
      turn_id: trace.turnId,
      status: "failed",
      error_code: "GENERATION_TRACE_WRITE_FAILED",
      error: safeError(error),
    })}\n`);
  }
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

export async function callStructuredModel(client: VertexClient, request: StructuredModelRequest): Promise<string> {
  const startedAt = Date.now();
  const deadlineAt = requestDeadline(client);
  const thinkingLevel = request.thinkingLevel ?? configuredThinkingLevel(request.label);
  const userParts: Array<Record<string, unknown>> = [{ text: request.prompt }];
  if (request.media) userParts.push({
    inlineData: { mimeType: request.media.mimeType, data: request.media.data },
  });
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: request.maxTokens ?? client.maxTokens,
      responseMimeType: "application/json",
      ...(request.responseSchema ? { responseJsonSchema: request.responseSchema } : {}),
      ...(thinkingLevel
        ? { thinkingConfig: { thinkingLevel } }
        : {}),
    },
  });
  const diagnostics = request.responseSchema
    ? schemaDiagnostics(request.responseSchema)
    : { sha256: "none", bytes: 0 };
  stageLog({
    stage: "model-call",
    turn_id: request.turnId,
    label: request.label,
    status: "started",
    model: client.model,
    thinking_level: thinkingLevel ?? "UNSPECIFIED",
    schema_sha256: diagnostics.sha256,
    schema_bytes: diagnostics.bytes,
    prompt_bytes: Buffer.byteLength(request.prompt),
    system_prompt_bytes: Buffer.byteLength(request.systemPrompt),
    request_bytes: Buffer.byteLength(requestBody),
    max_output_tokens: request.maxTokens ?? client.maxTokens,
    ...(request.lessonPlanPart ? { lesson_plan_part: request.lessonPlanPart } : {}),
    ...(request.lessonPlanSection === undefined ? {} : { lesson_plan_section: request.lessonPlanSection }),
    ...(request.lessonPlanAttempt === undefined ? {} : { lesson_plan_attempt: request.lessonPlanAttempt }),
  });
  let body = "";
  let status = 0;
  let requestId: string | undefined;
  try {
    let usedAttempts = 0;
    for (let requestAttempt = 1; requestAttempt <= client.requestAttempts; requestAttempt += 1) {
      usedAttempts = requestAttempt;
      let response: Response;
      try {
        response = await fetch(client.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${client.accessToken}`,
            "content-type": "application/json",
          },
          body: requestBody,
          signal: request.signal
            ? AbortSignal.any([
                request.signal,
                AbortSignal.timeout(timeoutUntil(deadlineAt, request.label)),
              ])
            : AbortSignal.timeout(timeoutUntil(deadlineAt, request.label)),
        });
      } catch (error) {
        const cancelled = request.signal?.aborted === true;
        const timeoutError = error instanceof Error
          && (error.name === "TimeoutError" || error.name === "AbortError");
        const cause = error instanceof Error && error.cause && typeof error.cause === "object"
          ? error.cause as Record<string, unknown>
          : undefined;
        const transportCode = typeof cause?.code === "string" ? cause.code : undefined;
        const canRetry = !cancelled && !timeoutError
          && requestAttempt < client.requestAttempts;
        stageLog({
          stage: "model-transport",
          turn_id: request.turnId,
          label: request.label,
          status: canRetry ? "retrying" : "failed",
          request_attempt: requestAttempt,
          ...(transportCode ? { transport_code: transportCode } : {}),
          error: safeError(error),
          ...(request.lessonPlanPart ? { lesson_plan_part: request.lessonPlanPart } : {}),
          ...(request.lessonPlanSection === undefined ? {} : { lesson_plan_section: request.lessonPlanSection }),
          ...(request.lessonPlanAttempt === undefined ? {} : { lesson_plan_attempt: request.lessonPlanAttempt }),
        });
        if (!canRetry) {
          if (cancelled || timeoutError) throw error;
          throw new ToolExecutionError(
            "VERTEX_TRANSPORT_FAILED",
            `Vertex ${request.label} transport failed${transportCode ? ` (${transportCode})` : ""}: ${safeError(error)}`,
          );
        }
        const delayMs = Math.min(
          500 * 2 ** (requestAttempt - 1),
          timeoutUntil(deadlineAt, request.label),
        );
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
        continue;
      }
      status = response.status;
      requestId = response.headers.get("x-goog-request-id") ?? requestId;
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
    const root = isRecord(payload) ? payload : {};
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const firstCandidate = isRecord(candidates[0]) ? candidates[0] : {};
    const usage = isRecord(root.usageMetadata) ? root.usageMetadata : {};
    const metric = (name: string): number | undefined => {
      const value = usage[name];
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    };
    stageLog({
      stage: "model-call",
      turn_id: request.turnId,
      label: request.label,
      status: "completed",
      http_status: status,
      request_attempts: usedAttempts,
      ...(requestId ? { request_id: requestId } : {}),
      ...(typeof firstCandidate.finishReason === "string"
        ? { finish_reason: firstCandidate.finishReason }
        : {}),
      ...(metric("promptTokenCount") === undefined
        ? {}
        : { prompt_tokens: metric("promptTokenCount") }),
      ...(metric("candidatesTokenCount") === undefined
        ? {}
        : { candidate_tokens: metric("candidatesTokenCount") }),
      ...(metric("thoughtsTokenCount") === undefined
        ? {}
        : { thought_tokens: metric("thoughtsTokenCount") }),
      ...(metric("cachedContentTokenCount") === undefined
        ? {}
        : { cached_content_tokens: metric("cachedContentTokenCount") }),
      ...(metric("totalTokenCount") === undefined
        ? {}
        : { total_tokens: metric("totalTokenCount") }),
      ...(typeof usage.trafficType === "string" ? { traffic_type: usage.trafficType } : {}),
      response_bytes: Buffer.byteLength(body),
      elapsed_ms: Date.now() - startedAt,
      ...(request.lessonPlanPart ? { lesson_plan_part: request.lessonPlanPart } : {}),
      ...(request.lessonPlanSection === undefined ? {} : { lesson_plan_section: request.lessonPlanSection }),
      ...(request.lessonPlanAttempt === undefined ? {} : { lesson_plan_attempt: request.lessonPlanAttempt }),
    });
    return content;
  } catch (error) {
    const cancelled = request.signal?.aborted === true;
    const timeoutError = error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError");
    const surfacedError = cancelled
      ? new ToolExecutionError(
          "MODEL_REQUEST_CANCELLED",
          `Vertex ${request.label} was cancelled because its lesson plan was rejected`,
        )
      : timeoutError
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
      ...(request.lessonPlanPart ? { lesson_plan_part: request.lessonPlanPart } : {}),
      ...(request.lessonPlanSection === undefined ? {} : { lesson_plan_section: request.lessonPlanSection }),
      ...(request.lessonPlanAttempt === undefined ? {} : { lesson_plan_attempt: request.lessonPlanAttempt }),
    });
    throw surfacedError;
  }
}

const SELECTION_CLASSIFICATION_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["text", "math", "geometry", "data", "unknown"],
    },
    content: { type: "string" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
  },
  required: ["kind", "content", "confidence"],
};

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
    response_kind: {
      type: "string",
      enum: ["explanation", "plot", "implicit_plot", "scene3d", "unsupported"],
    },
    scene_kind: { type: "string", enum: ["surface", "implicit_surface"] },
    title: { type: "string" },
    text: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    expression: { type: "string" },
    level: { type: "number" },
    reason_code: {
      type: "string",
      enum: [
        "unreadable_expression",
        "unsupported_variables",
        "unsupported_representation",
        "unsafe_complexity",
      ],
    },
    alternatives: { type: "array", items: { type: "string" } },
  },
  required: [
    "interpretation_kind",
    "interpretation_content",
    "interpretation_confidence",
    "response_kind",
    "scene_kind",
    "title",
    "text",
    "items",
    "expression",
    "level",
    "reason_code",
    "alternatives",
  ],
};

const SELECTION_EXPLANATION_RESPONSE_SCHEMA: JsonSchema = {
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
    response_kind: { type: "string", enum: ["explanation"] },
    title: { type: "string" },
    text: { type: "string" },
    items: { type: "array", items: { type: "string" } },
  },
  required: [
    "interpretation_kind",
    "interpretation_content",
    "interpretation_confidence",
    "response_kind",
    "title",
    "text",
    "items",
  ],
};

const SELECTION_BASE_SYSTEM_PROMPT = `你是白板选区辅助工具。只解释当前请求附带的选区图片和用户明确选中的局部白板对象，并在原稿旁边生成独立辅助内容；绝不重写、纠正或替换原稿。图片识别不确定时必须明确说明。board_targets 是 Runtime 提供的稳定引用，只能用于理解上下文，不能自行增删或改写。不要声称看到了选区图片以外的白板。

直接完成 learner_request。解释或检查请求只返回 title、text 和 items，并直接面向当前学习者。若输入提供了中高置信度的 selected_recognition，直接使用它，不要再次改写识别结果。`;

const SELECTION_VISUALIZATION_SYSTEM_PROMPT = `当 tool_id 为 generate-plot 或 custom-question 且用户要求生成函数图像时，先把识别到的公式规范化为只能使用数字、x/y/z、pi、e、+ - * / ^、括号和 abs/acos/asin/atan/ceil/cos/exp/floor/ln/log/round/sin/sqrt/tan 的表达式；必须显式写乘号。然后选择：
- 单变量 y=f(x)：response_kind=plot，expression 只写 f(x)。
- 二变量隐式方程 F(x,y)=c：response_kind=implicit_plot，expression 写 F(x,y)，level 写 c。
- 显式曲面 z=f(x,y)：response_kind=scene3d，scene_kind=surface，expression 只写 f(x,y)。
- 三变量隐式方程 F(x,y,z)=c：response_kind=scene3d，scene_kind=implicit_surface，expression 写 F(x,y,z)，level 写 c。
- 超过三个独立变量、无法可靠识别、无法转为上述安全表达式或在合理有限范围内无法绘制：response_kind=unsupported，给出准确原因和可操作的 alternatives，不能假装已经绘制。
坐标范围和三维网格精度由程序根据表达式按统一预算计算，不要填写坐标范围或采样密度。代码会再次校验表达式，无法在安全有限范围内找到图形时不会绘制。非绘图请求使用 explanation。`;

function hasReusableSelectionRecognition(input: SelectionToolInput): boolean {
  return input.content_hint !== "unknown"
    && Boolean(input.recognized_content?.trim())
    && (input.recognition_confidence === "high" || input.recognition_confidence === "medium");
}

function selectionResponseSchema(input: SelectionToolInput): JsonSchema {
  const explanation = input.tool_id === "explain" || input.tool_id === "check-and-suggest";
  const schema = structuredClone(
    explanation ? SELECTION_EXPLANATION_RESPONSE_SCHEMA : SELECTION_RESPONSE_SCHEMA,
  );
  // The tool identity already fixes explanation responses; making the model
  // echo that constant adds output tokens but no information.
  if (explanation) {
    delete schema.properties?.response_kind;
    schema.required = schema.required?.filter((field) => field !== "response_kind");
  }
  // Classification is a separate, persisted model result. When it is usable,
  // keep it as the source of truth rather than asking a second model call to
  // probabilistically copy the same three fields.
  if (hasReusableSelectionRecognition(input)) {
    for (const field of [
      "interpretation_kind",
      "interpretation_content",
      "interpretation_confidence",
    ]) {
      delete schema.properties?.[field];
    }
    schema.required = schema.required?.filter((field) => ![
      "interpretation_kind",
      "interpretation_content",
      "interpretation_confidence",
    ].includes(field));
  }
  return schema;
}

function selectionSystemPrompt(toolId: SelectionToolInput["tool_id"]): string {
  return toolId === "explain" || toolId === "check-and-suggest"
    ? SELECTION_BASE_SYSTEM_PROMPT
    : `${SELECTION_BASE_SYSTEM_PROMPT}\n\n${SELECTION_VISUALIZATION_SYSTEM_PROMPT}`;
}

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

async function selectionModelMedia(
  input: SelectionToolInput,
): Promise<StructuredModelRequest["media"]> {
  if (!input.selection_media) return undefined;
  const sessionWorkspace = resolve(
    process.env.OCTOS_SESSION_WORKSPACE?.trim()
      || process.env.OCTOS_WORK_DIR?.trim()
      || process.cwd(),
  );
  const candidate = resolve(sessionWorkspace, input.selection_media);
  if ((candidate !== sessionWorkspace && !candidate.startsWith(`${sessionWorkspace}${sep}`))
    || !isAbsolute(candidate)) {
    throw new Error("selection_media escapes OCTOS_SESSION_WORKSPACE");
  }
  const [canonicalWorkspace, canonicalPath] = await Promise.all([
    realpath(sessionWorkspace),
    realpath(candidate),
  ]);
  if (canonicalPath !== canonicalWorkspace
    && !canonicalPath.startsWith(`${canonicalWorkspace}${sep}`)) {
    throw new Error("selection_media escapes OCTOS_SESSION_WORKSPACE");
  }
  const data = await readFile(canonicalPath);
  if (data.byteLength === 0 || data.byteLength > 10 * 1024 * 1024) {
    throw new Error("selection_media must be between 1 byte and 10 MB");
  }
  const mimeType = data[0] === 0x89 && data[1] === 0x50
      && data[2] === 0x4e && data[3] === 0x47
    ? "image/png"
    : data[0] === 0xff && data[1] === 0xd8
      ? "image/jpeg"
      : data.subarray(0, 4).toString("ascii") === "RIFF"
          && data.subarray(8, 12).toString("ascii") === "WEBP"
        ? "image/webp"
        : undefined;
  if (!mimeType) throw new Error("selection_media must be PNG, JPEG, or WebP");
  return { mimeType, data: data.toString("base64") };
}

type SelectionRange = { min: number; max: number };

function selectionPaddedRange(values: number[], fallback: SelectionRange): SelectionRange {
  const finite = values.filter((value) => Number.isFinite(value) && Math.abs(value) <= 1e12).sort((a, b) => a - b);
  if (finite.length === 0) return fallback;
  const low = finite[Math.floor((finite.length - 1) * 0.02)]!;
  const high = finite[Math.ceil((finite.length - 1) * 0.98)]!;
  const span = high - low;
  const padding = span > 1e-9 ? span * 0.12 : Math.max(0.5, Math.abs(low) * 0.2);
  return { min: low - padding, max: high + padding };
}

function selectionExplicitViewport(expression: string): { x: SelectionRange; y: SelectionRange } {
  const evaluate = compileMathExpression(expression, ["x"]);
  const candidates: SelectionRange[] = [
    { min: -4, max: 4 },
    { min: 0.05, max: 8 },
    { min: -10, max: 10 },
  ];
  let best: { x: SelectionRange; values: number[]; ratio: number } | undefined;
  for (const xRange of candidates) {
    const values: number[] = [];
    for (let index = 0; index <= 160; index += 1) {
      const x = xRange.min + (xRange.max - xRange.min) * index / 160;
      try {
        const y = evaluate({ x });
        if (Number.isFinite(y) && Math.abs(y) <= 1e12) values.push(y);
      } catch {
        // A deterministic candidate may cross a singularity. Try the rest of
        // the domain and, if too little is drawable, the next candidate.
      }
    }
    const ratio = values.length / 161;
    if (!best || ratio > best.ratio) best = { x: xRange, values, ratio };
    if (ratio >= 0.75) {
      best = { x: xRange, values, ratio };
      break;
    }
  }
  if (!best || best.values.length < 8) throw new Error("Plot expression has no stable finite viewport");
  return { x: best.x, y: selectionPaddedRange(best.values, { min: -1, max: 1 }) };
}

function selectionSurfaceDomain(expression: string): { x: SelectionRange; y: SelectionRange } {
  const evaluate = compileMathExpression(expression, ["x", "y"]);
  const candidates = [
    { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
    { x: { min: 0.05, max: 4 }, y: { min: 0.05, max: 4 } },
    { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } },
  ];
  for (const candidate of candidates) {
    let finite = 0;
    for (let xIndex = 0; xIndex <= 12; xIndex += 1) {
      const x = candidate.x.min + (candidate.x.max - candidate.x.min) * xIndex / 12;
      for (let yIndex = 0; yIndex <= 12; yIndex += 1) {
        const y = candidate.y.min + (candidate.y.max - candidate.y.min) * yIndex / 12;
        try {
          const z = evaluate({ x, y });
          if (Number.isFinite(z) && Math.abs(z) <= 1e12) finite += 1;
        } catch {
          // Continue sampling this deterministic candidate.
        }
      }
    }
    if (finite / (13 * 13) >= 0.75) return candidate;
  }
  throw new Error("3D surface has no stable finite viewport");
}

function selectionImplicitDomain(
  expression: string,
  variables: ["x", "y"] | ["x", "y", "z"],
  level: number,
): { x: SelectionRange; y: SelectionRange; z?: SelectionRange } {
  const evaluate = compileMathExpression(expression, variables);
  for (const halfSpan of [2, 5, 10, 20]) {
    const range = { min: -halfSpan, max: halfSpan };
    const resolution = variables.length === 2 ? 16 : 8;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
      const x = range.min + (range.max - range.min) * xIndex / resolution;
      for (let yIndex = 0; yIndex <= resolution; yIndex += 1) {
        const y = range.min + (range.max - range.min) * yIndex / resolution;
        const zIterations = variables.length === 3 ? resolution : 0;
        for (let zIndex = 0; zIndex <= zIterations; zIndex += 1) {
          const z = variables.length === 3
            ? range.min + (range.max - range.min) * zIndex / resolution
            : 0;
          try {
            const value = evaluate(variables.length === 3 ? { x, y, z } : { x, y });
            if (!Number.isFinite(value) || Math.abs(value) > 1e12) continue;
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
          } catch {
            // Continue searching the bounded grid.
          }
        }
      }
    }
    if (minimum <= level && maximum >= level) {
      return { x: range, y: range, ...(variables.length === 3 ? { z: range } : {}) };
    }
  }
  throw new Error("Implicit surface level is outside the program-selected viewport");
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
  const finiteOutput = (name: string): number => {
    const number = output[name];
    if (typeof number !== "number" || !Number.isFinite(number)) {
      throw new Error(`${name} must be a finite number`);
    }
    return number;
  };
  const reusableRecognition = hasReusableSelectionRecognition(input);
  const kind = (reusableRecognition
    ? input.content_hint
    : nonEmpty("interpretation_kind")) as SelectionContentKind;
  if (!["text", "math", "geometry", "data", "unknown"].includes(kind)) {
    throw new Error("interpretation_kind is invalid");
  }
  const confidence = (reusableRecognition
    ? input.recognition_confidence
    : nonEmpty("interpretation_confidence")) as "high" | "medium" | "low";
  if (!["high", "medium", "low"].includes(confidence)) {
    throw new Error("interpretation_confidence is invalid");
  }
  const title = nonEmpty("title");
  const text = nonEmpty("text");
  const interpretationContent = reusableRecognition
    ? requireNonEmptyString(input.recognized_content, "recognized_content")
    : nonEmpty("interpretation_content");
  const items = Array.isArray(output.items)
    ? output.items.map((item, index) => requireNonEmptyString(item, `items[${index}]`))
    : [];
  let response: SelectionEnhancementArtifact["response"];
  const visualizationRequested = input.tool_id === "generate-plot"
    || input.tool_id === "custom-question";
  const alternatives = Array.isArray(output.alternatives)
    ? output.alternatives
      .map((item, index) => requireNonEmptyString(item, `alternatives[${index}]`))
      .slice(0, 4)
    : [];
  const unsupported = (
    reasonCode: Extract<SelectionEnhancementArtifact["response"], { kind: "unsupported" }>["reason_code"],
    reason: string,
  ): SelectionEnhancementArtifact["response"] => ({
    kind: "unsupported",
    title: "当前无法生成这个函数图像",
    text: reason,
    reason_code: reasonCode,
    alternatives: alternatives.length > 0
      ? alternatives
      : ["确认框选范围只包含一个完整公式", "使用“问小章鱼”让它解释或改写为可绘制形式"],
  });
  const failureReasonCode = (error: unknown): Extract<
    SelectionEnhancementArtifact["response"],
    { kind: "unsupported" }
  >["reason_code"] => {
    if (confidence === "low") return "unreadable_expression";
    const message = error instanceof Error ? error.message : String(error);
    if (/too complex/iu.test(message)) return "unsafe_complexity";
    if (/Unknown variable or function '[a-z]'/u.test(message)) {
      return "unsupported_variables";
    }
    return "unsupported_representation";
  };
  const responseKind = input.tool_id === "explain" || input.tool_id === "check-and-suggest"
    ? "explanation"
    : output.response_kind;
  try {
    if (responseKind === "plot" || responseKind === "implicit_plot") {
      if (!visualizationRequested) {
        throw new Error(`${input.tool_id} cannot return a plot response`);
      }
      const expression = nonEmpty("expression");
      if (responseKind === "plot") {
        const viewport = selectionExplicitViewport(expression);
        response = {
          kind: "plot",
          plot_kind: "explicit",
          title,
          text,
          expression,
          x_range: viewport.x,
          y_range: viewport.y,
        };
      } else {
        const level = finiteOutput("level");
        const viewport = selectionImplicitDomain(expression, ["x", "y"], level);
        response = {
          kind: "plot",
          plot_kind: "implicit",
          title,
          text,
          expression,
          level,
          samples: 80,
          x_range: viewport.x,
          y_range: viewport.y,
        };
      }
    } else if (responseKind === "scene3d") {
      if (!visualizationRequested) {
        throw new Error(`${input.tool_id} cannot return a 3D response`);
      }
      const sceneKind = nonEmpty("scene_kind");
      if (sceneKind !== "surface" && sceneKind !== "implicit_surface") {
        throw new Error("scene_kind is invalid");
      }
      const expression = nonEmpty("expression");
      const level = finiteOutput("level");
      const samples = 12;
      const viewport = sceneKind === "surface"
        ? selectionSurfaceDomain(expression)
        : selectionImplicitDomain(expression, ["x", "y", "z"], level);
      const object = sceneKind === "surface"
        ? {
            as: "selected-function",
            kind: "surface",
            expression,
            x_range: viewport.x,
            y_range: viewport.y,
            samples,
            color: "teal",
          }
        : {
            as: "selected-function",
            kind: "implicit_surface",
            expression,
            level,
            x_range: viewport.x,
            y_range: viewport.y,
            z_range: viewport.z!,
            samples,
            color: "teal",
          };
      response = {
        kind: "scene3d",
        title,
        text,
        content: {
          title,
          fallback: text,
          axes: true,
          camera: { yaw: .65, pitch: .45, zoom: 1 },
          objects: [object],
        },
      };
    } else if (responseKind === "unsupported") {
      const reasonCode = nonEmpty("reason_code") as Extract<
        SelectionEnhancementArtifact["response"],
        { kind: "unsupported" }
      >["reason_code"];
      if (!["unreadable_expression", "unsupported_variables", "unsupported_representation", "unsafe_complexity"].includes(reasonCode)) {
        throw new Error("reason_code is invalid");
      }
      response = unsupported(reasonCode, text);
    } else if (responseKind === "explanation") {
      response = visualizationRequested && input.tool_id === "generate-plot"
        ? unsupported(
            confidence === "low" ? "unreadable_expression" : "unsupported_representation",
            text,
          )
        : {
            kind: "explanation",
            title,
            text,
            ...(items.length > 0 ? { items } : {}),
          };
    } else {
      throw new Error("response_kind is invalid");
    }
  } catch (error) {
    if (!visualizationRequested) throw error;
    response = unsupported(
      failureReasonCode(error),
      `已经识别到“${interpretationContent}”，但当前无法安全地生成它的图像。`,
    );
  }
  return {
    profile: "octos.selection-enhancement",
    version: "0.2",
    turn_id: input.turn_id,
    created_at: new Date().toISOString(),
    source: structuredClone(input.source),
    board: structuredClone(input.board),
    tool_id: input.tool_id,
    interpretation: {
      kind,
      content: interpretationContent,
      confidence,
    },
    response,
  };
}

async function generateSelectionEnhancement(
  client: VertexClient,
  input: SelectionToolInput,
): Promise<SelectionEnhancementArtifact> {
  // A successful classification pass already transcribed the selected
  // formula. Re-uploading the same image for generate-plot wastes vision
  // tokens and can produce a second, inconsistent transcription. Keep the
  // image for explanations, custom questions, and uncertain recognition.
  const media = input.tool_id === "generate-plot" && hasReusableSelectionRecognition(input)
    ? undefined
    : await selectionModelMedia(input);
  const raw = await callStructuredModel(client, {
    label: "selection-enhancement",
    turnId: input.turn_id,
    maxTokens: Math.min(client.maxTokens, 4_096),
    responseSchema: selectionResponseSchema(input),
    media,
    systemPrompt: selectionSystemPrompt(input.tool_id),
    prompt: JSON.stringify({
      learner_request: input.learner_request,
      tool_id: input.tool_id,
      selected_recognition: {
        kind: input.content_hint,
        content: input.recognized_content ?? null,
        confidence: input.recognition_confidence ?? null,
      },
      attached_selection_image: Boolean(media),
      lesson_title: input.lesson_title ?? null,
      board_summary: input.board_summary ?? null,
      selected_board_context: input.board.targets.map((target) => ({
        kind: target.kind,
        label: target.label,
        value: target.value,
      })),
    }),
  });
  return parseSelectionModelResponse(raw, input);
}

function parseSelectionClassificationResponse(raw: string): SelectionClassification {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Selection classification is not JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value)) throw new Error("Selection classification must be an object");
  const kind = value.kind;
  if (kind !== "text" && kind !== "math" && kind !== "geometry"
    && kind !== "data" && kind !== "unknown") {
    throw new Error("Selection classification kind is invalid");
  }
  const confidence = value.confidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    throw new Error("Selection classification confidence is invalid");
  }
  const content = typeof value.content === "string" ? value.content.trim() : "";
  if (kind !== "unknown" && confidence !== "low" && !content) {
    throw new Error("Confident selection classification requires recognized content");
  }
  return { kind, content, confidence };
}

async function classifySelection(
  client: VertexClient,
  input: SelectionToolInput,
): Promise<SelectionClassification> {
  const media = await selectionModelMedia(input);
  if (!media) throw new Error("Selection classification requires an image");
  const raw = await callStructuredModel(client, {
    label: "selection-classification",
    turnId: input.turn_id,
    maxTokens: Math.min(client.maxTokens, 512),
    responseSchema: SELECTION_CLASSIFICATION_RESPONSE_SCHEMA,
    media,
    systemPrompt: `你只分类学生明确选中的原始笔迹，不回答问题，不生成课程或白板内容。kind 只能是 text、math、geometry、data、unknown。只有图片中能直接读到数学表达式、方程或函数时才返回 math；圆圈、下划线、箭头、套索或普通曲线标记不是数学表达式。content 只抄录图片中可辨认的内容，不利用课程背景补全。无法可靠辨认时返回 unknown 或 low confidence。你看不到也不得猜测笔迹下方的课程内容。`,
    prompt: JSON.stringify({
      source_id: input.source.source_id,
      selected_ink_image: "authoritative",
    }),
  });
  return parseSelectionClassificationResponse(raw);
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
  if (error instanceof Error) {
    const cause = error.cause && typeof error.cause === "object"
      ? error.cause as Record<string, unknown>
      : undefined;
    const causeMessage = typeof cause?.message === "string" ? cause.message : undefined;
    const causeCode = typeof cause?.code === "string" ? cause.code : undefined;
    return [
      error.message,
      causeCode ? `cause=${causeCode}` : "",
      causeMessage && causeMessage !== error.message ? causeMessage : "",
    ].filter(Boolean).join(": ").slice(0, MAX_ERROR_BODY_LENGTH);
  }
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
    if (invokedTool !== TOOL_NAME
      && invokedTool !== SELECTION_TOOL_NAME
      && invokedTool !== SELECTION_CLASSIFICATION_TOOL_NAME) {
      throw new Error(
        `Unknown tool '${invokedTool ?? ""}'. Expected '${TOOL_NAME}', '${SELECTION_TOOL_NAME}', or '${SELECTION_CLASSIFICATION_TOOL_NAME}'`,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const rawInput = Buffer.concat(chunks).toString("utf8");
    const traceTurnId = traceTurnIdFromRawInput(rawInput);
    if (traceTurnId) beginStageTrace(traceTurnId, invokedTool, startedAt);
    if (invokedTool === SELECTION_CLASSIFICATION_TOOL_NAME) {
      const input = parseSelectionClassificationInput(rawInput);
      const client = await createVertexClient();
      const classification = await classifySelection(client, input);
      stageLog({
        stage: "selection-classification",
        turn_id: input.turn_id,
        status: "completed",
        elapsed_ms: Date.now() - startedAt,
      });
      emit({
        success: true,
        output: "Selection classified without modifying source ink.",
        structured_metadata: { selection_classification: classification },
      });
      return;
    }
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
    const input = parseCompleteLessonInput(rawInput);
    const client = await createVertexClient();
    let publishedParts = 0;
    const publishPrefix = async (prefix: AuthoringLesson, part: number): Promise<void> => {
      const artifactPath = partialOutputPath(input, part);
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify(prefix, null, 2)}\n`, "utf8");
      publishedParts += 1;
      emitArtifactProgress(
        artifactPath,
        "oll_lesson_part",
        `part=${part} elapsed_ms=${Date.now() - startedAt}`,
      );
      stageLog({
        stage: "lesson-prefix-published",
        turn_id: input.turn_id,
        status: "completed",
        completed_sections: part,
        elapsed_ms: Date.now() - startedAt,
      });
    };
    {
      const { generateLessonPlanWithModel } = await import("./lesson-plan.js");
      stageLog({
        stage: "lesson-plan-generation",
        turn_id: input.turn_id,
        status: "started",
        mode: "lesson_plan",
      });
      const generatedLessonPlan = await generateLessonPlanWithModel(
        (request) => callStructuredModel(client, {
          label: request.label,
          turnId: request.turn_id,
          systemPrompt: request.system_prompt,
          prompt: request.prompt,
          responseSchema: request.response_schema,
          maxTokens: request.max_output_tokens,
          lessonPlanPart: request.part,
          lessonPlanSection: request.section,
          lessonPlanAttempt: request.attempt,
        }),
        {
          turn_id: input.turn_id,
          learner_request: input.learner_request,
          language: input.language,
          learner_context: input.learner_context,
          tutor_context: input.tutor_context,
          input_modality: input.input_modality,
        },
        {
          bootstrap_first_section: true,
          max_concurrency: Math.min(
            parsePositiveInteger(
              process.env.OLL_SECTION_CONCURRENCY,
              2,
              "OLL_SECTION_CONCURRENCY",
            ),
            2,
          ),
          compile: { language: input.language },
          on_rejected_part: (event) => stageLog({
            stage: "lesson-plan-local-rejection",
            turn_id: input.turn_id,
            ...event,
          }),
          on_playable_prefix: async ({ completed_sections, compiled }) => {
            await publishPrefix(compiled.lesson, completed_sections);
          },
          on_concurrency_fallback: ({ section, reason }) => stageLog({
            stage: "lesson-plan-concurrency",
            turn_id: input.turn_id,
            status: "fallback",
            section,
            reason,
          }),
        },
      );
      if ("disposition" in generatedLessonPlan) {
        stageLog({
          stage: "lesson-plan-generation",
          turn_id: input.turn_id,
          status: "completed",
          mode: "lesson_plan",
          disposition: generatedLessonPlan.disposition,
          model_calls: generatedLessonPlan.model_calls,
          elapsed_ms: Date.now() - startedAt,
        });
        emit({
          success: true,
          output: generatedLessonPlan.learner_response,
          structured_metadata: {
            lesson_disposition: generatedLessonPlan.disposition,
            learner_response: generatedLessonPlan.learner_response,
          },
          authoring_strategy: "lesson_plan",
          lesson_plan_model_calls: generatedLessonPlan.model_calls,
          published_parts: 0,
        });
        return;
      }
      const artifactPath = outputPath(input);
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify(generatedLessonPlan.lesson, null, 2)}\n`, "utf8");
      stageLog({
        stage: "lesson-plan-generation",
        turn_id: input.turn_id,
        status: "completed",
        mode: "lesson_plan",
        sections: generatedLessonPlan.lesson.steps.length,
        model_calls: generatedLessonPlan.model_calls,
        elapsed_ms: Date.now() - startedAt,
      });
      emit({
        success: true,
        output: `Validated OLL lesson generated through the Lesson Plan path with ${process.env.OLL_MODEL?.trim() || DEFAULT_MODEL}.`,
        files_to_send: [artifactPath],
        authoring_strategy: "lesson_plan",
        lesson_plan_model_calls: generatedLessonPlan.model_calls,
        lesson_plan_sections: generatedLessonPlan.lesson.steps.length,
        published_parts: publishedParts,
      });
      return;
    }
  } catch (error) {
    const message = safeError(error);
    stageLog({
      stage: "lesson-generation",
      status: "failed",
      elapsed_ms: Date.now() - startedAt,
      error_code: error instanceof ToolExecutionError
        ? error.code
        : invokedTool === SELECTION_CLASSIFICATION_TOOL_NAME
          ? "SELECTION_CLASSIFICATION_FAILED"
          : invokedTool === SELECTION_TOOL_NAME
            ? "SELECTION_ENHANCEMENT_FAILED"
            : "LESSON_GENERATION_FAILED",
    });
    process.stderr.write(`learning-coach: ${message}\n`);
    const terminalForTurn = invokedTool === TOOL_NAME;
    emit({
      success: false,
      error_code: error instanceof ToolExecutionError
        ? error.code
        : invokedTool === SELECTION_CLASSIFICATION_TOOL_NAME
          ? "SELECTION_CLASSIFICATION_FAILED"
          : invokedTool === SELECTION_TOOL_NAME
            ? "SELECTION_ENHANCEMENT_FAILED"
            : "LESSON_GENERATION_FAILED",
      output: terminalForTurn
        ? `Lesson generation already exhausted its internal attempts. Do not call oll_generate_lesson again in this turn. Report the failure once to the learner. ${message}`
        : message,
      ...(terminalForTurn ? {
        retryable: false,
        do_not_retry_same_turn: true,
        structured_metadata: {
          retryable: false,
          do_not_retry_same_turn: true,
        },
      } : {}),
    });
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
