import {
  createStructuredModelRouter,
  HedgedStructuredModelRouter,
  type StructuredModelClient,
  type StructuredModelRouter,
} from "./main.js";
import {
  generateLessonPlanWithModel,
  type LessonPlanGenerationResult,
  type GenerateLessonPlanOptions,
  type LessonPlanGenerationInput,
} from "./lesson-plan-generation.js";

type ProviderSchemaMode = "full" | "shallow" | "json";

function providerSchemaMode(): ProviderSchemaMode {
  const configured = process.env.OLL_VERTEX_SCHEMA_MODE?.trim().toLowerCase() ?? "full";
  if (configured === "full" || configured === "shallow" || configured === "json") return configured;
  throw new Error(`OLL_VERTEX_SCHEMA_MODE must be full, shallow, or json; received ${configured}`);
}

/**
 * Evaluation-only projection which constrains the response envelope and its
 * named top-level collections without sending every nested Lesson Plan field
 * to Vertex. Local validation remains identical to the full mode.
 *
 * This intentionally is not the production default. It exists so the live
 * evaluation suite can measure whether a smaller provider grammar saves time
 * without hiding malformed or lower-quality model output.
 */
function shallowProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const project = (value: unknown, depth: number): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const source = value as Record<string, unknown>;
    if (typeof source.$ref === "string") return {};
    if (source.type === "array") {
      return {
        type: "array",
        ...(depth < 2 && source.items ? { items: project(source.items, depth + 1) } : {}),
      };
    }
    if (source.type === "object" || source.properties) {
      if (depth >= 2) return { type: "object" };
      const properties = source.properties && typeof source.properties === "object" && !Array.isArray(source.properties)
        ? Object.fromEntries(Object.entries(source.properties as Record<string, unknown>)
          .map(([key, child]) => [key, project(child, depth + 1)]))
        : undefined;
      return {
        type: "object",
        ...(Array.isArray(source.required) ? { required: source.required } : {}),
        ...(properties ? { properties } : {}),
      };
    }
    const result: Record<string, unknown> = {};
    if (typeof source.type === "string") result.type = source.type;
    if (Array.isArray(source.enum)) result.enum = source.enum;
    return result;
  };
  return project(schema, 0) as Record<string, unknown>;
}

export interface GenerateLessonPlanWithVertexOptions extends GenerateLessonPlanOptions {
  client?: StructuredModelClient;
  router?: StructuredModelRouter;
}

/**
 * Real-provider adapter for the isolated Lesson Plan path.
 *
 * Live evaluations and the explicitly enabled experimental tool path share
 * this adapter. The default production path does not load this module.
 */
export async function generateLessonPlanWithVertex(
  input: LessonPlanGenerationInput,
  options: GenerateLessonPlanWithVertexOptions = {},
): Promise<LessonPlanGenerationResult> {
  const router = options.router
    ?? (options.client
      ? new HedgedStructuredModelRouter(options.client)
      : await createStructuredModelRouter());
  const schemaMode = providerSchemaMode();
  const {
    client: _client,
    router: _router,
    on_rejected_part: onRejectedPart,
    ...generationOptions
  } = options;
  return generateLessonPlanWithModel(
    (request) => router.call(
      {
        label: request.label,
        turnId: request.turn_id,
        systemPrompt: request.system_prompt,
        prompt: request.prompt,
        responseSchema: schemaMode === "json"
          ? undefined
          : schemaMode === "shallow"
            ? shallowProviderSchema(request.response_schema)
            : request.response_schema,
        lessonPlanPart: request.part,
        lessonPlanSection: request.section,
        lessonPlanAttempt: request.attempt,
        // The isolated live adapter has no file transport. Production camera
        // lessons attach media in main.ts through the dedicated action.
      },
    ),
    input,
    {
      ...generationOptions,
      on_rejected_part: async (event) => {
        router.rejectLastResponse();
        await onRejectedPart?.(event);
      },
    },
  );
}
