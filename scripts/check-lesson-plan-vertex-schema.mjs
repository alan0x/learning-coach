import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for this live contract check");

const entry = `
  import { createVertexClient, probeVertexSchema } from ${JSON.stringify(resolve(root, "src/main.ts"))};
  import { buildLessonPlanBootstrapJsonSchema, buildLessonPlanOutlineJsonSchema, buildLessonPlanSectionDraftJsonSchema } from ${JSON.stringify(resolve(root, "src/lesson-plan-schema.ts"))};
  export { createVertexClient, probeVertexSchema, buildLessonPlanBootstrapJsonSchema, buildLessonPlanOutlineJsonSchema, buildLessonPlanSectionDraftJsonSchema };
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "lesson-plan-schema-contract-entry.ts" },
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

function clone(value) {
  return structuredClone(value);
}

function removeKeywords(value, keys) {
  if (!value || typeof value !== "object") return;
  for (const key of keys) delete value[key];
  for (const child of Object.values(value)) removeKeywords(child, keys);
}

function addEnumTypes(value) {
  if (!value || typeof value !== "object") return;
  if (!value.type && Array.isArray(value.enum) && value.enum.length > 0) {
    if (value.enum.every((item) => typeof item === "string")) value.type = "string";
    if (value.enum.every((item) => typeof item === "number")) value.type = "number";
  }
  for (const child of Object.values(value)) addEnumTypes(child);
}

const current = api.buildLessonPlanOutlineJsonSchema(3);
const bootstrap = api.buildLessonPlanBootstrapJsonSchema(3);
const noNumericBounds = clone(current);
removeKeywords(noNumericBounds, new Set(["minimum", "maximum"]));
const noArrayBounds = clone(current);
removeKeywords(noArrayBounds, new Set(["minItems", "maxItems"]));
const noBounds = clone(current);
removeKeywords(noBounds, new Set(["minimum", "maximum", "minItems", "maxItems"]));
const typedEnums = clone(current);
addEnumTypes(typedEnums);
const lean = clone(current);
delete lean.properties.teaching_strategies;
delete lean.properties.numbers;
delete lean.properties.sections.items.properties.reusable_items;
if (lean.properties.close.properties.focus) {
  delete lean.properties.close.properties.focus.items.properties.part;
}
const core = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "goals", "request_coverage", "sections", "close"],
  properties: {
    version: { type: "string", enum: ["0.1"] },
    title: { type: "string" },
    goals: { type: "array", items: { type: "string" } },
    request_coverage: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request_part", "treatment", "sections"],
        properties: {
          request_part: { type: "integer" },
          treatment: { type: "string", enum: ["teach", "unsupported"] },
          sections: { type: "array", items: { type: "integer" } },
          reason: { type: "string" },
        },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["purpose", "allowed_capabilities"],
        properties: {
          purpose: { type: "string" },
          allowed_capabilities: { type: "array", items: { type: "string" } },
        },
      },
    },
    close: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
  },
};

const decimalShape = {
  type: "object",
  additionalProperties: false,
  required: ["mantissa", "scale"],
  properties: {
    mantissa: { type: "integer", minimum: -1_000_000_000_000, maximum: 1_000_000_000_000 },
    scale: { enum: [0, 1, 2, 3, 4, 5, 6] },
  },
};
const decimalInline = {
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: { value: decimalShape },
};
const decimalRef = {
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: { value: { $ref: "#/$defs/modelDecimal" } },
  $defs: { modelDecimal: decimalShape },
};

const unitCircleSectionOutline = {
  numbers: [{ initial: 0, min: 0, max: 6.283, label: "旋转角度" }],
  course_visuals: [{
    capability: "unit_circle_projection",
    create_section: 1,
    use_sections: [1],
    relation: "primary",
    reusable_item: 1,
  }],
  sections: [{
    purpose: "用单位圆和正弦图解释旋转与周期波动",
    allowed_capabilities: ["unit_circle_projection"],
    reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "unit_circle_projection" }],
  }],
};
const unitCircleSection = api.buildLessonPlanSectionDraftJsonSchema(unitCircleSectionOutline, 1);
const cubeSection = api.buildLessonPlanSectionDraftJsonSchema({
  numbers: [{ initial: 0, min: -1, max: 1, label: "截面高度" }],
  course_visuals: [{
    capability: "cube_with_section",
    create_section: 1,
    use_sections: [1],
    relation: "primary",
    reusable_item: 1,
  }],
  sections: [{
    purpose: "用可旋转正方体观察顶点、棱、面和水平截面",
    allowed_capabilities: ["cube_with_section"],
    reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "cube_with_section" }],
  }],
}, 1);
const sectionNoActivities = clone(unitCircleSection);
delete sectionNoActivities.properties.number_activities;
delete sectionNoActivities.properties.scene3d_activities;
sectionNoActivities.required = sectionNoActivities.required.filter((key) => !["number_activities", "scene3d_activities"].includes(key));
const sectionStringDecimals = clone(unitCircleSection);
const replaceDecimalRefs = (value) => {
  if (!value || typeof value !== "object") return;
  if (value.$ref === "#/$defs/modelDecimal") {
    for (const key of Object.keys(value)) delete value[key];
    value.type = "string";
    return;
  }
  for (const child of Object.values(value)) replaceDecimalRefs(child);
};
replaceDecimalRefs(sectionStringDecimals);
delete sectionStringDecimals.$defs.modelDecimal;
const sectionInlineReferences = clone(unitCircleSection);
const referenceDefinition = clone(sectionInlineReferences.$defs.modelReference);
const replaceReferenceRefs = (value) => {
  if (!value || typeof value !== "object") return;
  if (value.$ref === "#/$defs/modelReference") {
    for (const key of Object.keys(value)) delete value[key];
    Object.assign(value, clone(referenceDefinition));
    return;
  }
  for (const child of Object.values(value)) replaceReferenceRefs(child);
};
replaceReferenceRefs(sectionInlineReferences);
delete sectionInlineReferences.$defs.modelReference;

const variants = process.argv.includes("--bootstrap-only") ? [[
  "outline-and-first-section-bootstrap",
  bootstrap,
]] : process.argv.includes("--decimal-contract") ? [
  ["decimal-inline", decimalInline],
  ["decimal-ref", decimalRef],
] : process.argv.includes("--section-differential") ? [
  ["section-current", unitCircleSection],
  ["section-no-activities", sectionNoActivities],
  ["section-string-decimals", sectionStringDecimals],
  ["section-inline-references", sectionInlineReferences],
] : process.argv.includes("--section-only") ? [[
  "unit-circle-section",
  unitCircleSection,
]] : process.argv.includes("--section-3d-only") ? [[
  "cube-section",
  cubeSection,
]] : [
  ["current", current],
  ["typed-enums", typedEnums],
  ["no-numeric-bounds", noNumericBounds],
  ["no-array-bounds", noArrayBounds],
  ["no-bounds", noBounds],
  ["lean", lean],
  ["core", core],
];
const client = await api.createVertexClient();
for (const [name, schema] of variants) {
  const result = await api.probeVertexSchema(client, schema);
  process.stdout.write(`${JSON.stringify({
    name,
    bytes: Buffer.byteLength(JSON.stringify(schema)),
    ...result,
  })}\n`);
}
