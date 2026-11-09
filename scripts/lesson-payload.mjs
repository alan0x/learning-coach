// Offline measurement of every model request Coach makes while generating a
// lesson, without calling a model. Each course fixture is generated through
// every input route (text, voice, camera, selection, self-contained) and every
// request path (combined first request, fallback outline, section, repair,
// single-section practice), answering the model with the fixture's own
// responses. Bytes are an offline guard; provider tokens and latency come from
// live traces (prompt_tokens, cached_content_tokens, first playable).
//
// The camera and selection image is not part of these bytes.

import { createHash } from "node:crypto";

const ROUTES = {
  self_contained: {},
  text: { input_modality: "text" },
  voice: { input_modality: "voice" },
  camera: { input_modality: "text", camera_input: true },
  selection: { input_modality: "text", selection_input: true },
};
const MODES = ["normal", "fallback_outline", "section_repair", "single_section_practice"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function admissionEnvelope(request, course) {
  if (!request.response_schema.properties?.disposition) return JSON.stringify(course);
  return JSON.stringify({
    disposition: "generate_lesson",
    learner_response: "",
    ...(request.response_schema.properties.image_observation ? {
      image_observation: { readability: "readable", observed_content: "测试画面中的学习内容", uncertainties: [] },
    } : {}),
    course,
  });
}

function entryPoint(request) {
  if (request.label === "lesson-plan-bootstrap") return "first_request";
  if (request.label === "lesson-plan-outline") return "fallback_outline";
  if (request.part === "practice") return "practice";
  if (request.prompt.includes("previous_validation_error")) return "section_repair";
  return request.section === 1 ? "first_section_retry" : "later_section";
}

function measure(request) {
  const schema = JSON.stringify(request.response_schema);
  const bytes = {
    system_prompt: Buffer.byteLength(request.system_prompt),
    prompt: Buffer.byteLength(request.prompt),
    schema: Buffer.byteLength(schema),
  };
  bytes.total = bytes.system_prompt + bytes.prompt + bytes.schema;
  return {
    bytes,
    schema_sha256: sha256(schema),
    request_sha256: sha256(JSON.stringify([request.system_prompt, request.prompt, schema])),
  };
}

function fixtureDrafts(plan, helpers) {
  const drafts = plan.sections.map(({ moments, student_activities }, index) => helpers.toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = helpers.stagedOutline(plan, drafts);
  return { drafts, outline, firstSection: helpers.bootstrapSectionFromExact(outline, drafts[0]) };
}

async function runOnce(api, helpers, name, plan, route, mode) {
  const source = mode === "single_section_practice"
    ? { ...plan, sections: plan.sections.slice(0, 1) }
    : plan;
  const { drafts, outline, firstSection } = fixtureDrafts(structuredClone(source), helpers);
  const requests = [];
  let repaired = false;
  const model = async (request) => {
    requests.push({ ...measure(request), entry_point: entryPoint(request), section: request.section, attempt: request.attempt });
    if (request.label === "lesson-plan-bootstrap") {
      if (mode === "fallback_outline") {
        // A truncated combined response. Camera and selection fall back to the
        // outline request only when the image observation was already complete.
        throw Object.assign(new Error("truncated"), {
          code: "LESSON_MODEL_RESPONSE_TRUNCATED",
          partialResponse: '{"disposition":"generate_lesson","learner_response":"","image_observation":'
            + '{"readability":"readable","observed_content":"测试画面中的学习内容","uncertainties":[]},"course":{',
        });
      }
      return helpers.bootstrapModelResponse(request, outline, firstSection);
    }
    if (request.label === "lesson-plan-outline") return admissionEnvelope(request, outline);
    if (request.part === "practice") return JSON.stringify({ answer_activities: [] });
    if (mode === "section_repair" && request.section === 2 && !repaired) {
      repaired = true;
      return "{}";
    }
    return helpers.sectionModelResponse(request, drafts);
  };
  let error;
  try {
    await api.generateLessonPlanWithModel(model, {
      turn_id: `payload-${name}-${route}-${mode}`,
      learner_request: plan.title,
      request_parts: [plan.title],
      language: "zh-CN",
      ...ROUTES[route],
    }, { max_attempts_per_part: 2 });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { fixture: name, route, mode, requests, ...(error ? { error } : {}) };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)], max: sorted.at(-1) };
}

/** Every request for every fixture, route and path, plus per-entry-point summaries. */
export async function measureLessonPayload(api, fixtures, helpers) {
  const runs = [];
  for (const [name, plan] of Object.entries(fixtures)) {
    for (const route of Object.keys(ROUTES)) {
      for (const mode of MODES) runs.push(await runOnce(api, helpers, name, plan, route, mode));
    }
  }
  const groups = new Map();
  for (const run of runs) for (const request of run.requests) {
    const key = `${run.route}/${request.entry_point}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(request);
  }
  const entryPoints = Object.fromEntries([...groups.entries()].sort().map(([key, requests]) => [key, {
    requests: requests.length,
    total_bytes: summarize(requests.map((r) => r.bytes.total)),
    system_prompt_bytes: summarize(requests.map((r) => r.bytes.system_prompt)),
    prompt_bytes: summarize(requests.map((r) => r.bytes.prompt)),
    schema_bytes: summarize(requests.map((r) => r.bytes.schema)),
    distinct_schemas: new Set(requests.map((r) => r.schema_sha256)).size,
  }]));
  return { fixtures: Object.keys(fixtures), routes: Object.keys(ROUTES), modes: MODES, entry_points: entryPoints, runs };
}

/** Requests above their entry point's ceiling, entry points without a ceiling, and failed runs. */
export function checkPayloadCeilings(report, ceilings) {
  const problems = [];
  for (const run of report.runs) {
    if (run.error) problems.push(`${run.fixture} ${run.route} ${run.mode}: generation failed: ${run.error}`);
    for (const request of run.requests) {
      const key = `${run.route}/${request.entry_point}`;
      const limit = ceilings.entry_points[key];
      if (!limit) {
        problems.push(`${key}: no ceiling recorded`);
        continue;
      }
      for (const field of ["total", "schema"]) {
        if (request.bytes[field] > limit[`${field}_bytes`]) {
          problems.push(`${run.fixture} ${run.mode} ${key}: ${field} ${request.bytes[field]} B exceeds ceiling ${limit[`${field}_bytes`]} B`);
        }
      }
    }
  }
  return [...new Set(problems)];
}
