import {
  LESSON_PLAN_CAPABILITY_NAMES,
  LESSON_PLAN_CAPABILITY_NUMBER_LIMITS,
  LESSON_PLAN_CAPABILITY_REGISTRY,
  LESSON_PLAN_VISUAL_FEATURES,
  LESSON_PLAN_VERSION,
  LessonPlanError,
  type LessonPlanCapability,
  type LessonPlanOutline,
} from "./lesson-plan.js";

export type LessonPlanJsonSchema = Record<string, unknown>;

const capabilityNames = LESSON_PLAN_CAPABILITY_NAMES;
const timingNames = ["before_speech", "during_speech", "after_speech"];
const deliveryNames = ["neutral", "patient", "encouraging", "careful", "emphatic"];
const boardKinds = ["text", "math", "shape", "note", "table", "image", "visual"];

export const LESSON_PLAN_VISUAL_PARAMETER_NAMES = Object.fromEntries(
  capabilityNames.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].parameter_names]),
) as Record<LessonPlanCapability, readonly string[]>;

function object(properties: Record<string, unknown>, required: string[] = []): LessonPlanJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    ...(required.length ? { required } : {}),
    properties,
  };
}

function vertexCompatible(value: LessonPlanJsonSchema): LessonPlanJsonSchema {
  const result = structuredClone(value);
  let usesDecimal = false;
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const record = candidate as Record<string, unknown>;
    // The v1beta1 responseJsonSchema endpoint used by gemini-3.6-flash rejects
    // array-length keywords with a generic INVALID_ARGUMENT response. Exact
    // collection sizes are still enforced immediately after generation by the
    // Lesson Plan validators.
    delete record.minItems;
    delete record.maxItems;
    // gemini-3.6-flash can serialize an ordinary decimal such as -1.5 as an
    // unbounded decimal expansion while following responseJsonSchema, even
    // when the value is transported as a string. The provider contract uses
    // two bounded integers instead: -1.5 is { mantissa: -15, scale: 1 }.
    // Local code converts that representation back to a finite number and the
    // original Lesson Plan validators still enforce the semantic range.
    if (record.type === "number") {
      usesDecimal = true;
      for (const key of Object.keys(record)) delete record[key];
      record.$ref = "#/$defs/modelDecimal";
      return;
    }
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(result);
  if (usesDecimal) {
    const definitions = result.$defs && typeof result.$defs === "object" && !Array.isArray(result.$defs)
      ? result.$defs as Record<string, unknown>
      : {};
    result.$defs = {
      ...definitions,
      modelDecimal: object({
        mantissa: { type: "integer", minimum: -1_000_000_000_000, maximum: 1_000_000_000_000 },
        scale: { enum: [0, 1, 2, 3, 4, 5, 6] },
      }, ["mantissa", "scale"]),
    };
  }
  return result;
}

function coerceModelNumbers(value: unknown, schema: unknown, path: string): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return value;
  const shape = schema as Record<string, unknown>;
  if (shape.type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string"
      && value.length > 0
      && value.length <= 64
      && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)) {
      const legacyNumber = Number(value);
      if (Number.isFinite(legacyNumber)) return legacyNumber;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected { mantissa, scale } for a decimal number");
    }
    const decimal = value as Record<string, unknown>;
    if (Object.keys(decimal).some((key) => key !== "mantissa" && key !== "scale")
      || !Number.isInteger(decimal.mantissa)
      || Math.abs(Number(decimal.mantissa)) > 1_000_000_000_000
      || !Number.isInteger(decimal.scale)
      || Number(decimal.scale) < 0
      || Number(decimal.scale) > 6) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected bounded integer mantissa and scale from 0 to 6");
    }
    const number = Number(decimal.mantissa) / 10 ** Number(decimal.scale);
    if (!Number.isFinite(number)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected a finite decimal number");
    }
    return number;
  }
  if (shape.type === "array") {
    if (!Array.isArray(value)) return value;
    return value.map((item, index) => coerceModelNumbers(item, shape.items, `${path}[${index}]`));
  }
  if (shape.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const properties = shape.properties && typeof shape.properties === "object" && !Array.isArray(shape.properties)
      ? shape.properties as Record<string, unknown>
      : {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      coerceModelNumbers(child, properties[key], `${path}.${key}`),
    ]));
  }
  return value;
}

function string(_maximumLength = 1_200): LessonPlanJsonSchema {
  // The Vertex response-schema endpoint used by this skill has rejected
  // string-length keywords. The local Lesson Plan validator still enforces
  // non-empty strings and exact limits after generation.
  return { type: "string" };
}

function integer(minimum = 1, maximum?: number): LessonPlanJsonSchema {
  return { type: "integer", minimum, ...(maximum === undefined ? {} : { maximum }) };
}

function referenceSchema(sectionCount: number): LessonPlanJsonSchema {
  void sectionCount;
  return { $ref: "#/$defs/modelReference" };
}

function referenceDefinitionSchema(sectionCount: number): LessonPlanJsonSchema {
  return object({
    source: { enum: ["local_board_item", "local_connection", "local_group", "reusable", "host"] },
    section: integer(0, sectionCount),
    moment: integer(0, 12),
    item: integer(0, 48),
    host_reference: integer(0, 24),
    part: object({
      kind: { enum: ["capability", "index"] },
      role: { type: "string" },
      index: integer(1, 24),
    }, ["kind"]),
  }, ["source", "section", "moment", "item", "host_reference"]);
}

function numberSchema(): LessonPlanJsonSchema {
  return object({
    initial: { type: "number" },
    min: { type: "number" },
    max: { type: "number" },
    label: { type: "string" },
    unit: { type: "string" },
    student_control: object({
      kind: { enum: ["slider"] },
      step: { type: "number", minimum: 0 },
    }, ["kind"]),
  }, ["initial", "min", "max"]);
}

function modelReusableBoardSchema(): LessonPlanJsonSchema {
  // The staged model path currently exposes ordinary reusable math and note
  // cards. The complete Lesson Plan contract supports more kinds, but they
  // must not be advertised by this provider schema until their model-facing
  // create shapes are implemented.
  return object({
    kind: { enum: ["board_item"] },
    board_kind: { enum: ["math", "note"] },
  }, ["kind", "board_kind"]);
}

function placementSchema(sectionCount: number): LessonPlanJsonSchema {
  void sectionCount;
  return object({
    relation: { enum: ["new_region", "below", "above", "left_of", "right_of", "near"] },
    align: { enum: ["start", "center", "end"] },
    gap: { enum: ["tight", "normal", "wide"] },
  }, ["relation"]);
}

function visualParametersSchema(
  allowedCapabilities: LessonPlanCapability[],
  numberCount = 0,
  requireDynamicPlotExpression = false,
  canonicalFunctionPlot = false,
): LessonPlanJsonSchema {
  const properties: Record<string, unknown> = { title: string(240) };
  const uses = (capability: LessonPlanCapability): boolean => allowedCapabilities.includes(capability);
  if (uses("unit_circle_projection")) properties.projection = { enum: ["sin", "cos"] };
  if (uses("function_plot")) {
    if (!canonicalFunctionPlot) {
      properties.expression = string(256);
      properties.expressions = { type: "array", minItems: 1, maxItems: 8, items: string(256) };
    }
    if (numberCount > 0 || canonicalFunctionPlot) {
      properties.expression_tokens = {
        type: "array",
        minItems: 1,
        maxItems: 128,
        items: mathTokenSchema(numberCount, true),
      };
    }
    properties.curve_label = string(160);
    properties.curve_labels = { type: "array", minItems: 1, maxItems: 8, items: string(160) };
  }
  if (uses("function_plot") || uses("function_surface_with_section")) {
    properties.x_min = { type: "number" };
    properties.x_max = { type: "number" };
    properties.y_min = { type: "number" };
    properties.y_max = { type: "number" };
  }
  if (uses("function_surface_with_section")) {
    properties.expression = string(256);
    properties.samples = integer(4, 24);
    properties.section_axis = { enum: ["x", "y", "z"] };
  }
  if (uses("circle_and_arc") || uses("coordinate_circle")) properties.radius = { type: "number", minimum: 0 };
  if (uses("circle_and_arc")) properties.angle = { type: "number" };
  if (uses("coordinate_circle")) {
    properties.center_x = { type: "number" };
    properties.center_y = { type: "number" };
  }
  if (uses("geometric_rearrangement")) {
    properties.construction = {
      enum: [...LESSON_PLAN_CAPABILITY_REGISTRY.geometric_rearrangement.parameter_options.construction],
    };
    properties.leg_a = { type: "number", minimum: 0 };
    properties.leg_b = { type: "number", minimum: 0 };
  }
  if (uses("process_diagram")) {
    properties.steps = { type: "array", minItems: 1, maxItems: 24, items: string(240) };
  }
  return object(properties, (requireDynamicPlotExpression || canonicalFunctionPlot) ? ["expression_tokens"] : []);
}

function contentSchema(allowedCapabilities: LessonPlanCapability[]): LessonPlanJsonSchema {
  return object({
    text: string(),
    latex: string(),
    title: string(240),
    items: { type: "array", minItems: 1, maxItems: 24, items: string(480) },
    columns: { type: "array", minItems: 1, maxItems: 24, items: string(160) },
    rows: { type: "array", maxItems: 100, items: { type: "array", maxItems: 24 } },
    resource: integer(1, 24),
    alt: string(480),
    ...(allowedCapabilities.length ? {
      capability: { enum: allowedCapabilities },
      parameters: visualParametersSchema(allowedCapabilities),
      numbers: {
        type: "array",
        maxItems: Math.max(...allowedCapabilities.map((capability) => LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability])),
        items: integer(1, 16),
      },
    } : {}),
  });
}

function orderedAction(
  properties: Record<string, unknown>,
  required: string[],
): LessonPlanJsonSchema {
  return object({ order: integer(1, 48), ...properties }, ["order", ...required]);
}

function actionCollectionSchemas(
  sectionCount: number,
  allowedCapabilities: LessonPlanCapability[],
  reusableCount: number,
  numberCount: number,
  courseVisualPositions: number[] = [],
  includeVisualCreates = true,
): Record<string, LessonPlanJsonSchema> {
  const reference = referenceSchema(sectionCount);
  const timing = { enum: timingNames };
  const collection = (items: LessonPlanJsonSchema): LessonPlanJsonSchema => ({ type: "array", items });
  const createCommon = {
    timing,
    role: string(80),
    placement: placementSchema(sectionCount),
    ...(reusableCount > 0 ? { reusable_item: integer(1, reusableCount) } : {}),
  };
  // When a section can only create a function plot and the course declares
  // multiple numeric controls, a static curve cannot represent those controls.
  // Make the mathematical dependency mandatory at the provider boundary. For
  // mixed-capability sections the local validator below remains authoritative,
  // because applying this requirement to every visual would also constrain
  // unrelated geometry and 3D content.
  const requireFunctionPlotParameters = allowedCapabilities.length === 1
    && allowedCapabilities[0] === "function_plot";
  const requireDynamicPlotExpression = numberCount > 1
    && allowedCapabilities.length === 1
    && allowedCapabilities[0] === "function_plot";
  return {
    ...(allowedCapabilities.length && includeVisualCreates ? {
      visual_creates: collection(orderedAction({
        ...createCommon,
        ...(courseVisualPositions.length > 0
          ? { course_visual: { enum: courseVisualPositions } }
          : {}),
        content: object({
          capability: { enum: allowedCapabilities },
          parameters: visualParametersSchema(
            allowedCapabilities,
            numberCount,
            requireDynamicPlotExpression,
          ),
          ...(numberCount > 0 ? {
            numbers: {
              type: "array",
              maxItems: Math.max(...allowedCapabilities.map(
                (capability) => LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability],
              )),
              items: { enum: Array.from({ length: numberCount }, (_unused, index) => index + 1) },
            },
          } : {}),
        }, ["capability", ...(requireFunctionPlotParameters ? ["parameters"] : [])]),
      }, ["role", ...(courseVisualPositions.length > 0 ? ["course_visual"] : []), "content", "placement"])),
    } : {}),
    math_creates: collection(orderedAction({
      ...createCommon,
      content: object({ latex: string() }, ["latex"]),
    }, ["role", "content", "placement"])),
    note_creates: collection(orderedAction({
      ...createCommon,
      content: object({
        title: string(240),
        items: { type: "array", minItems: 1, maxItems: 24, items: string(480) },
      }, ["title", "items"]),
    }, ["role", "content", "placement"])),
    focuses: collection(orderedAction({
      timing,
      references: { type: "array", items: reference },
      intent: string(160),
    }, ["references", "intent"])),
    points: collection(orderedAction({ timing, reference }, ["reference"])),
    ...(numberCount > 0 ? {
      animations: collection(orderedAction({
        timing,
        number: { enum: Array.from({ length: numberCount }, (_unused, index) => index + 1) },
        end_value: { type: "number" },
        easing: { enum: ["linear", "ease_in_out"] },
        duration_intent: { enum: ["brief", "normal", "extended"] },
      }, ["number", "end_value"])),
    } : {}),
  };
}

function courseVisualCreatesSchema(
  outline: LessonPlanOutline,
  sectionIndex: number,
): LessonPlanJsonSchema | undefined {
  const numberCount = outline.numbers?.length ?? 0;
  const entries = (outline.course_visuals ?? [])
    .map((visual, index) => ({ visual, position: index + 1 }))
    .filter(({ visual }) => visual.create_section === sectionIndex);
  if (entries.length === 0) return undefined;
  const properties = Object.fromEntries(entries.map(({ visual, position }) => {
    const capability = visual.capability;
    const numberLimit = LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability];
    return [`visual_${position}`, object({
      moment: integer(1, 12),
      order: integer(1, 48),
      timing: { enum: timingNames },
      role: string(80),
      content: object({
        parameters: visualParametersSchema(
          [capability],
          numberCount,
          false,
          capability === "function_plot",
        ),
        ...(numberCount > 0 && numberLimit > 0 ? {
          numbers: {
            type: "array",
            maxItems: numberLimit,
            items: { enum: Array.from({ length: numberCount }, (_unused, index) => index + 1) },
          },
        } : {}),
      }, ["parameters"]),
      placement: placementSchema(outline.sections.length),
    }, ["moment", "order", "role", "content", "placement"])];
  }));
  return object(properties, Object.keys(properties));
}

function reusableBoardCreatesSchema(
  outline: LessonPlanOutline,
  sectionIndex: number,
): LessonPlanJsonSchema | undefined {
  const entries = (outline.sections[sectionIndex - 1]?.reusable_items ?? [])
    .map((item, index) => ({ item, position: index + 1 }))
    .filter(({ item }) => item.kind === "board_item" && item.board_kind !== "visual");
  if (entries.length === 0) return undefined;
  const properties = Object.fromEntries(entries.map(({ item, position }) => {
    let content: LessonPlanJsonSchema;
    if (item.board_kind === "math") {
      content = object({ latex: string() }, ["latex"]);
    } else if (item.board_kind === "note") {
      content = object({
        title: string(240),
        items: { type: "array", minItems: 1, maxItems: 24, items: string(480) },
      }, ["title", "items"]);
    } else {
      throw new LessonPlanError(
        "LESSON_PLAN_REUSABLE",
        `$lessonPlanOutline.sections[${sectionIndex - 1}].reusable_items[${position - 1}]`,
        `the staged model path cannot create a reusable ${String(item.board_kind)} board item`,
      );
    }
    return [`item_${position}`, object({
      moment: integer(1, 12),
      order: integer(1, 48),
      timing: { enum: timingNames },
      role: string(80),
      content,
      placement: placementSchema(outline.sections.length),
    }, ["moment", "order", "role", "content", "placement"])];
  }));
  return object(properties, Object.keys(properties));
}

function mathTokenSchema(numberCount: number, allowInput = false): LessonPlanJsonSchema {
  return object({
    kind: { enum: [...(allowInput ? ["input"] : []), "number", "literal", "constant", "negate", "operator", "function"] },
    number: { enum: Array.from({ length: numberCount }, (_unused, index) => index + 1) },
    literal_mantissa: integer(-1_000_000_000_000, 1_000_000_000_000),
    literal_scale: { enum: [0, 1, 2, 3, 4, 5, 6] },
    name: { enum: ["pi", "e", "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "ln", "log", "round", "sin", "sqrt", "tan"] },
    operator: { enum: ["add", "subtract", "multiply", "divide", "power"] },
  }, ["kind"]);
}

function decimalIntegerFields(prefix: string): Record<string, unknown> {
  return {
    [`${prefix}_mantissa`]: integer(-1_000_000_000_000, 1_000_000_000_000),
    [`${prefix}_scale`]: { enum: [0, 1, 2, 3, 4, 5, 6] },
  };
}

function activityCommonSchema(): Record<string, unknown> {
  return {
    order: integer(1, 16),
    prompt: string(480),
    hints: { type: "array", minItems: 1, maxItems: 8, items: string(480) },
    hint_after_attempts: integer(1, 20),
    success_message: string(480),
  };
}

function numberActivitySchema(numberCount: number): LessonPlanJsonSchema {
  return object({
    ...activityCommonSchema(),
    number: { enum: Array.from({ length: numberCount }, (_unused, index) => index + 1) },
    ...decimalIntegerFields("value"),
  }, [
    "order", "prompt", "number", "value_mantissa", "value_scale", "hints",
  ]);
}

function scene3dActivitySchema(sectionCount: number): LessonPlanJsonSchema {
  void sectionCount;
  return object({
    ...activityCommonSchema(),
    controls: { type: "array", minItems: 1, items: { enum: ["orbit", "zoom", "preset", "reset"] } },
    view_preset: { enum: ["top", "front", "right", "left", "isometric"] },
    angular_tolerance_degrees: integer(1, 90),
    zoom_tolerance_percent: integer(1, 100),
  }, [
    "order", "prompt", "controls", "view_preset",
    "angular_tolerance_degrees", "zoom_tolerance_percent", "hints",
  ]);
}

function outlineShape(value: unknown): LessonPlanOutline {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LessonPlanError("LESSON_PLAN_OUTLINE", "$lessonPlanOutline", "expected an object");
  }
  const outline = value as Partial<LessonPlanOutline>;
  if (!Array.isArray(outline.sections) || outline.sections.length === 0) {
    throw new LessonPlanError("LESSON_PLAN_OUTLINE", "$lessonPlanOutline.sections", "outline requires sections");
  }
  return outline as LessonPlanOutline;
}

function bootstrapPermissiveOutline(): LessonPlanOutline {
  return {
    sections: [{
      purpose: "bootstrap",
      allowed_capabilities: capabilityNames,
      reusable_items: Array.from({ length: 32 }, () => ({ kind: "board_item" })),
    }],
    numbers: Array.from({ length: 16 }, () => ({ initial: 0, min: 0, max: 1 })),
    course_visuals: Array.from({ length: 32 }, (_unused, index) => ({
      capability: capabilityNames[index % capabilityNames.length],
      create_section: 1,
      use_sections: [1],
      relation: "primary",
      reusable_item: index + 1,
    })),
  } as LessonPlanOutline;
}

export function buildLessonPlanOutlineJsonSchema(requestPartCount = 0): LessonPlanJsonSchema {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  return vertexCompatible(lessonPlanOutlineShapeJsonSchema(requestPartCount));
}

/**
 * Provider schema for the first request of a course: the complete outline and
 * section 1 arrive together. The section shape deliberately permits every
 * currently supported visual and every positional reference. Once the model
 * response arrives, the ordinary outline-derived section schema and validators
 * narrow it to the capabilities, numbers, reusable items, and visuals that the
 * returned outline actually declared.
 */
export function buildLessonPlanBootstrapJsonSchema(requestPartCount = 0): LessonPlanJsonSchema {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  const firstSection = lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true);
  const modelReference = (firstSection.$defs as Record<string, unknown> | undefined)?.modelReference;
  delete firstSection.$defs;
  return vertexCompatible({
    ...object({
      outline: lessonPlanOutlineShapeJsonSchema(requestPartCount),
      first_section: firstSection,
    }, ["outline", "first_section"]),
    ...(modelReference ? { $defs: { modelReference } } : {}),
  });
}

function lessonPlanOutlineShapeJsonSchema(requestPartCount: number): LessonPlanJsonSchema {
  return object({
    version: { enum: [LESSON_PLAN_VERSION] },
    title: string(160),
    goals: { type: "array", minItems: 1, maxItems: 8, items: string(480) },
    teaching_strategies: { type: "array", maxItems: 16, items: string(240) },
    numbers: { type: "array", maxItems: 16, items: numberSchema() },
    ...(requestPartCount > 0 ? {
      request_coverage: {
        type: "array",
        minItems: requestPartCount,
        maxItems: requestPartCount,
        items: object({
          request_part: integer(1, requestPartCount),
          treatment: { enum: ["teach", "unsupported"] },
          sections: { type: "array", maxItems: 24, items: integer(1, 24) },
          reason: string(480),
        }, ["request_part", "treatment", "sections"]),
      },
    } : {}),
    course_visuals: {
      type: "array",
      maxItems: 32,
      items: object({
        required_features: {
          type: "array",
          minItems: 1,
          maxItems: LESSON_PLAN_VISUAL_FEATURES.length,
          items: { enum: LESSON_PLAN_VISUAL_FEATURES },
        },
        create_section: integer(1, 24),
        use_sections: { type: "array", maxItems: 24, items: integer(1, 24) },
        relation: { enum: ["primary", "supporting", "comparison"] },
        related_visual: integer(1, 32),
      }, ["required_features", "create_section", "use_sections", "relation"]),
    },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: object({
        purpose: string(480),
        reusable_items: { type: "array", maxItems: 32, items: modelReusableBoardSchema() },
      }, ["purpose"]),
    },
    close: object({
      summary: string(),
    }, ["summary"]),
  }, ["version", "title", "goals", ...(requestPartCount > 0 ? ["request_coverage"] : []), "course_visuals", "sections", "close"]);
}

export function coerceLessonPlanOutlineModelNumbers(value: unknown, requestPartCount = 0): unknown {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  return coerceModelNumbers(value, lessonPlanOutlineShapeJsonSchema(requestPartCount), "$lessonPlanOutline");
}

export function buildLessonPlanSectionDraftJsonSchema(
  outlineValue: unknown,
  sectionIndex: number,
): LessonPlanJsonSchema {
  return vertexCompatible(lessonPlanSectionDraftShapeJsonSchema(outlineValue, sectionIndex));
}

function lessonPlanSectionDraftShapeJsonSchema(
  outlineValue: unknown,
  sectionIndex: number,
  bootstrapPermissive = false,
): LessonPlanJsonSchema {
  const outline = outlineShape(outlineValue);
  if (!Number.isInteger(sectionIndex) || sectionIndex < 1 || sectionIndex > outline.sections.length) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$section", "section is outside the outline");
  }
  const section = outline.sections[sectionIndex - 1];
  const allowedCapabilities = section.allowed_capabilities;
  if (!Array.isArray(allowedCapabilities) || allowedCapabilities.some((item) => !capabilityNames.includes(item))) {
    throw new LessonPlanError("LESSON_PLAN_CAPABILITY", `$lessonPlanOutline.sections[${sectionIndex - 1}].allowed_capabilities`, "outline has invalid capabilities");
  }
  const reusableCount = section.reusable_items?.length ?? 0;
  const numberCount = outline.numbers?.length ?? 0;
  const courseVisualCreates = bootstrapPermissive
    ? undefined
    : courseVisualCreatesSchema(outline, sectionIndex);
  const reusableBoardCreates = bootstrapPermissive
    ? undefined
    : reusableBoardCreatesSchema(outline, sectionIndex);
  const actionCollections = actionCollectionSchemas(
    outline.sections.length,
    allowedCapabilities,
    bootstrapPermissive ? reusableCount : 0,
    numberCount,
    (outline.course_visuals ?? [])
      .map((visual, index) => ({ visual, position: index + 1 }))
      .filter(({ visual }) => visual.create_section === sectionIndex)
      .map(({ position }) => position),
    bootstrapPermissive,
  );
  const supportsNumberActivity = Array.isArray(outline.numbers) && outline.numbers.length > 0;
  const sectionVisualCapabilities = (outline.course_visuals ?? [])
    .filter((visual) => visual.use_sections.includes(sectionIndex))
    .map((visual) => visual.capability);
  const supportsScene3dActivity = [...allowedCapabilities, ...sectionVisualCapabilities].some((capability) => (
    LESSON_PLAN_CAPABILITY_REGISTRY[capability].output_kinds.includes("scene3d" as never)
  ));
  const activityProperties: Record<string, unknown> = {
    ...(supportsNumberActivity ? {
      number_activities: {
        type: "array",
        maxItems: 16,
        items: numberActivitySchema(numberCount),
      },
    } : {}),
    ...(supportsScene3dActivity ? {
      scene3d_activities: {
        type: "array",
        maxItems: 16,
        items: scene3dActivitySchema(outline.sections.length),
      },
    } : {}),
  };
  const schema = object({
    version: { enum: [LESSON_PLAN_VERSION] },
    section: { enum: [sectionIndex] },
    moments: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: object({
        narration: string(),
        delivery: { enum: deliveryNames },
        ...actionCollections,
      }, ["narration", "delivery", ...Object.keys(actionCollections)]),
    },
    ...(courseVisualCreates ? { course_visual_creates: courseVisualCreates } : {}),
    ...(reusableBoardCreates ? { reusable_board_creates: reusableBoardCreates } : {}),
    ...activityProperties,
  }, [
    "version",
    "section",
    "moments",
    ...(courseVisualCreates ? ["course_visual_creates"] : []),
    ...(reusableBoardCreates ? ["reusable_board_creates"] : []),
    ...Object.keys(activityProperties),
  ]);
  schema.$defs = { modelReference: referenceDefinitionSchema(outline.sections.length) };
  return schema;
}

export function coerceLessonPlanSectionModelNumbers(
  value: unknown,
  outlineValue: unknown,
  sectionIndex: number,
): unknown {
  return coerceModelNumbers(
    value,
    lessonPlanSectionDraftShapeJsonSchema(outlineValue, sectionIndex),
    "$lessonPlanModelSection",
  );
}

export function coerceLessonPlanBootstrapSectionModelNumbers(value: unknown): unknown {
  return coerceModelNumbers(
    value,
    lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true),
    "$lessonPlanModelSection",
  );
}
