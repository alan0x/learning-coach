#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provider = process.env.OLL_PROVIDER?.trim().toLowerCase();
if (!provider || !["vertex", "gemini", "ark"].includes(provider)) {
  throw new Error("OLL_PROVIDER must be vertex, gemini, or ark");
}
const repetitions = Number(process.env.PROVIDER_SCHEMA_PROBE_REPETITIONS ?? 10);
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 100) {
  throw new Error("PROVIDER_SCHEMA_PROBE_REPETITIONS must be an integer from 1 to 100");
}

const entry = `
  import { createStructuredModelClient, probeStructuredModelSchema } from ${JSON.stringify(resolve(root, "src/main.ts"))};
  import { buildLessonPlanAdmissionOutlineJsonSchema, buildLessonPlanSectionDraftJsonSchema } from ${JSON.stringify(resolve(root, "src/lesson-plan-schema.ts"))};
  export { createStructuredModelClient, probeStructuredModelSchema, buildLessonPlanAdmissionOutlineJsonSchema, buildLessonPlanSectionDraftJsonSchema };
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "provider-schema-probe-entry.ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

const representativeOutline = {
  version: "0.1",
  title: "单位圆与正弦函数",
  goals: ["理解单位圆纵坐标与正弦函数的关系"],
  numbers: [{
    label: "旋转角度",
    initial: 0,
    range: { min: 0, max: 360 },
    student_control: { kind: "slider" },
  }],
  course_visuals: [{
    capability: "unit_circle_projection",
    create_section: 1,
    use_sections: [1, 2],
    relation: "primary",
  }],
  sections: [
    { purpose: "建立单位圆投影", allowed_capabilities: ["unit_circle_projection"] },
    { purpose: "解释周期变化", allowed_capabilities: [] },
  ],
  close: { summary: "旋转角度的正弦值形成周期波动。" },
};

const schemas = [
  {
    name: "lesson-plan-outline",
    label: "lesson-plan-outline",
    value: api.buildLessonPlanAdmissionOutlineJsonSchema(3),
  },
  {
    name: "lesson-plan-section",
    label: "lesson-plan-section",
    value: api.buildLessonPlanSectionDraftJsonSchema(representativeOutline, 1),
  },
];

const results = [];
for (const schema of schemas) {
  for (let attempt = 1; attempt <= repetitions; attempt += 1) {
    const client = await api.createStructuredModelClient();
    const result = await api.probeStructuredModelSchema(client, schema.value, {
      label: schema.label,
      turnId: `provider-schema-${schema.name}-${attempt}`,
    });
    results.push({ schema: schema.name, attempt, ...result });
    process.stderr.write(
      `${schema.name} ${attempt}/${repetitions}: ${result.ok ? "ok" : result.error_code} ${result.elapsed_ms}ms\n`,
    );
  }
}

const successful = results.filter((entry) => entry.ok);
const sortedTimes = successful.map((entry) => entry.elapsed_ms).sort((a, b) => a - b);
const percentile = (fraction) => sortedTimes.length === 0
  ? null
  : sortedTimes[Math.min(sortedTimes.length - 1, Math.ceil(sortedTimes.length * fraction) - 1)];
const report = {
  provider,
  model: process.env.OLL_MODEL ?? null,
  repetitions,
  success: successful.length,
  total: results.length,
  p50_ms: percentile(0.5),
  p90_ms: percentile(0.9),
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (successful.length !== results.length) process.exitCode = 1;
