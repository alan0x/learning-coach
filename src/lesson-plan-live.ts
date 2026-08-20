import {
  callStructuredModel,
  createVertexClient,
  type VertexClient,
} from "./main.js";
import {
  generateLessonPlanWithModel,
  type GeneratedLessonPlan,
  type GenerateLessonPlanOptions,
  type LessonPlanGenerationInput,
} from "./lesson-plan-generation.js";

export interface GenerateLessonPlanWithVertexOptions extends GenerateLessonPlanOptions {
  client?: VertexClient;
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
): Promise<GeneratedLessonPlan> {
  const client = options.client ?? await createVertexClient();
  const {
    client: _client,
    ...generationOptions
  } = options;
  return generateLessonPlanWithModel(
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
    input,
    {
      ...generationOptions,
      bootstrap_first_section: generationOptions.bootstrap_first_section ?? true,
    },
  );
}
