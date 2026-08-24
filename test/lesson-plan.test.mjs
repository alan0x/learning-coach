import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { evaluateMathExpression } from "octos-lesson-language";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lessonPlanBundle = await build({
  entryPoints: [resolve(root, "src/lesson-plan-api.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const lessonPlanApi = await import(
  `data:text/javascript;base64,${Buffer.from(lessonPlanBundle.outputFiles[0].contents).toString("base64")}`
);
const {
  LESSON_PLAN_CAPABILITIES,
  LESSON_PLAN_CAPABILITY_NAMES,
  LESSON_PLAN_CAPABILITY_NUMBER_INPUTS,
  LESSON_PLAN_CAPABILITY_REGISTRY,
  LESSON_PLAN_VISUAL_FEATURES,
  LessonPlanError,
  assembleLessonPlan,
  buildLessonPlanBootstrapJsonSchema,
  buildLessonPlanOutlineJsonSchema,
  buildLessonPlanSectionDraftJsonSchema,
  buildLessonPlanAdmissionBootstrapJsonSchema,
  buildLessonPlanAdmissionOutlineJsonSchema,
  compileAndValidateLessonPlan,
  deriveLessonRequestParts,
  generateLessonPlanWithModel,
  matchLessonPlanCapability,
  resolveLessonPlan,
  validateLessonPlanOutline,
} = lessonPlanApi;
import { completeLessonPlanFixtures } from "./lesson-plan-course-fixtures.mjs";

const capabilities = Object.keys(LESSON_PLAN_CAPABILITIES);

test("model-facing visual requirements map to exactly one installed program capability", () => {
  assert.equal(
    matchLessonPlanCapability(["unit_circle", "projection", "cartesian_function_curve"]),
    "unit_circle_projection",
  );
  assert.equal(
    matchLessonPlanCapability(["polygon_pieces", "rigid_rearrangement", "area_relation"]),
    "geometric_rearrangement",
  );
  assert.throws(
    () => matchLessonPlanCapability(["solid_3d", "cartesian_function_curve"]),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
  );
  assert.throws(
    () => matchLessonPlanCapability(["unit_circle"]),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
  );

  const outlineSchema = buildLessonPlanOutlineJsonSchema();
  const visualProperties = outlineSchema.properties.course_visuals.items.properties;
  assert.equal("capability" in visualProperties, false);
  assert.ok("required_features" in visualProperties);
  assert.deepEqual(
    visualProperties.required_features.items.enum,
    LESSON_PLAN_VISUAL_FEATURES,
  );
});

test("the capability registry separates model teaching choices from program execution policy", () => {
  const programOwned = new Set(["samples", "x_min", "x_max", "y_min", "y_max"]);
  for (const [name, capability] of Object.entries(LESSON_PLAN_CAPABILITY_REGISTRY)) {
    assert.equal(
      capability.number_input_policies.length,
      capability.number_inputs.length,
      `${name} number policy count`,
    );
    for (const parameter of capability.model_parameter_names) {
      assert.ok(capability.parameter_names.includes(parameter), `${name}.${parameter}`);
      assert.equal(programOwned.has(parameter), false, `${name}.${parameter}`);
    }
  }
});

function reusable(section, item, part) {
  return {
    source: "reusable",
    section,
    item,
    ...(part ? { part } : {}),
  };
}

function localBoardItem(moment, item) {
  return { source: "local_board_item", moment, item };
}

const modelActionCollectionByName = {
  focus: "focuses",
  point_at: "points",
  animate: "animations",
};
const modelActionCollectionNames = [
  "visual_creates", "math_creates", "note_creates",
  ...Object.values(modelActionCollectionByName),
];

function modelFormula(tokens) {
  const stack = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push("x");
    else if (token.kind === "number") stack.push(`n${token.number}`);
    else if (token.kind === "literal") stack.push(String(token.value));
    else if (token.kind === "constant") stack.push(token.name);
    else if (token.kind === "negate") stack.push(`-(${stack.pop()})`);
    else if (token.kind === "function") stack.push(`${token.name}(${stack.pop()})`);
    else if (token.kind === "operator") {
      const right = stack.pop();
      const left = stack.pop();
      const operator = { add: "+", subtract: "-", multiply: "*", divide: "/", power: "^" }[token.operator];
      stack.push(`(${left}${operator}${right})`);
    }
  }
  assert.equal(stack.length, 1);
  return stack[0];
}

function toModelSectionDraft(draft) {
  const numberActivities = [];
  const scene3dActivities = [];
  const reusableBoardCreates = {};
  for (const [index, activity] of (draft.student_activities ?? []).entries()) {
    const { kind, ...payload } = activity;
    const decimalFields = (prefix, value) => {
      const scale = 6;
      return {
        [`${prefix}_mantissa`]: Math.round(value * 10 ** scale),
        [`${prefix}_scale`]: scale,
      };
    };
    const encoded = { ...payload };
    if (kind === "number_target") {
      delete encoded.value;
      delete encoded.tolerance;
      delete encoded.expression;
      encoded.number = payload.number_controls[0].number;
      delete encoded.number_controls;
      Object.assign(encoded, decimalFields("value", payload.value));
    } else {
      for (const key of ["match", "yaw", "pitch", "zoom", "angular_tolerance", "zoom_tolerance"]) delete encoded[key];
      delete encoded.reference;
      encoded.view_preset = Math.abs(payload.pitch - Math.PI / 2) < 0.01
        ? "top"
        : Math.abs(payload.yaw - Math.PI / 2) < 0.01
          ? "right"
          : "front";
      encoded.angular_tolerance_degrees = Math.max(1, Math.round(payload.angular_tolerance * 180 / Math.PI));
      encoded.zoom_tolerance_percent = Math.max(1, Math.round(payload.zoom_tolerance * 100));
    }
    const target = kind === "number_target" ? numberActivities : scene3dActivities;
    target.push(encoded);
  }
  const moments = draft.moments.map((moment, momentIndex) => {
    const grouped = Object.fromEntries(modelActionCollectionNames.map((name) => [name, []]));
    moment.actions.forEach((action, index) => {
      const { action: actionName, ...rawPayload } = action;
      const payload = structuredClone(rawPayload);
      const collection = actionName === "create"
        ? `${payload.kind}_creates`
        : modelActionCollectionByName[actionName];
      if (!(collection in grouped)) throw new Error(`unsupported model fixture action '${actionName}:${payload.kind ?? ""}'`);
      if (actionName === "focus") delete payload.references;
      if (actionName === "point_at") delete payload.reference;
      if (actionName === "create") {
        const boardKind = payload.kind;
        delete payload.kind;
        const tokens = payload.content?.parameters?.expression_tokens;
        if (Array.isArray(tokens)) {
          payload.content.parameters.formulas = [modelFormula(tokens)];
          delete payload.content.parameters.expression_tokens;
        }
        if ((boardKind === "math" || boardKind === "note")
          && Number.isInteger(payload.reusable_item)) {
          const reusableItem = payload.reusable_item;
          delete payload.reusable_item;
          reusableBoardCreates[`item_${reusableItem}`] = {
            moment: momentIndex + 1,
            ...payload,
          };
          return;
        }
      }
      grouped[collection].push(payload);
    });
    return {
      narration: moment.narration ?? "",
      delivery: moment.delivery ?? "neutral",
      ...grouped,
    };
  });
  return {
    version: draft.version,
    section: draft.section,
    moments,
    ...(Object.keys(reusableBoardCreates).length > 0 ? { reusable_board_creates: reusableBoardCreates } : {}),
    number_activities: numberActivities,
    scene3d_activities: scene3dActivities,
  };
}

function staticFunctionTokens(expression) {
  if (expression === "x^2") {
    return [
      { kind: "input" },
      { kind: "literal", literal_mantissa: 2_000_000, literal_scale: 6 },
      { kind: "operator", operator: "power" },
    ];
  }
  if (expression === "ln(x)") {
    return [{ kind: "input" }, { kind: "function", name: "ln" }];
  }
  throw new Error(`test fixture needs explicit model tokens for '${expression}'`);
}

function modelCourseVisualStructure(plan, drafts = [], { canonical = true } = {}) {
  const courseVisuals = [];
  const sections = plan.sections.map((section, sectionIndex) => {
    const creates = section.moments.flatMap((moment) => moment.actions)
      .filter((action) => action.action === "create" && action.kind === "visual");
    creates.forEach((action) => {
      const position = courseVisuals.length + 1;
      courseVisuals.push({
        required_features: [
          ...LESSON_PLAN_CAPABILITY_REGISTRY[action.content.capability].required_features,
        ],
        create_section: sectionIndex + 1,
        use_sections: Array.from(
          { length: plan.sections.length - sectionIndex },
          (_unused, offset) => sectionIndex + offset + 1,
        ),
        relation: position === 1 ? "primary" : "supporting",
        ...(position === 1 ? {} : { related_visual: 1 }),
      });
    });
    return {
      purpose: section.purpose,
      reusable_items: (section.reusable_items ?? []).filter((item) => item.board_kind !== "visual"),
    };
  });
  for (const [sectionIndex, draft] of drafts.entries()) {
    const positions = courseVisuals
      .map((visual, index) => ({ visual, position: index + 1 }))
      .filter(({ visual }) => visual.create_section === sectionIndex + 1)
      .map(({ position }) => position);
    const creates = draft.moments.flatMap((moment, momentIndex) => (
      (moment.visual_creates ?? []).map((create) => ({ create, moment: momentIndex + 1 }))
    ));
    creates.forEach(({ create }, index) => { create.course_visual = positions[index]; });
    if (canonical && creates.length > 0) {
      draft.course_visual_creates = Object.fromEntries(creates.map(({ create, moment }) => {
        const entry = structuredClone(create);
        const position = entry.course_visual;
        delete entry.course_visual;
        delete entry.reusable_item;
        delete entry.content.capability;
        if (entry.content.parameters?.expression !== undefined) {
          entry.content.parameters.formulas = [entry.content.parameters.expression];
          delete entry.content.parameters.expression;
        }
        return [`visual_${position}`, { moment, ...entry }];
      }));
      draft.moments.forEach((moment) => { delete moment.visual_creates; });
    }
  }
  return { course_visuals: courseVisuals, sections };
}

function samplePlan(capability) {
  const hasNumber = capability !== "process_diagram";
  const is3d = capability === "cube_with_section"
    || capability === "function_surface_with_section";
  const firstMomentActions = [
    {
      action: "create",
      kind: "visual",
      role: "main_visual",
      content: {
        capability,
        parameters: capability === "function_plot" ? { expression: "x^2" } : {},
        ...(hasNumber ? { numbers: [1] } : {}),
      },
      placement: { relation: "new_region" },
      reusable_item: 1,
    },
    {
      action: "focus",
      references: [localBoardItem(1, 1)],
      intent: "show the main visual",
      timing: "after_speech",
    },
  ];
  if (hasNumber) {
    firstMomentActions.push({
      action: "animate",
      number: 1,
      end_value: 0.75,
      easing: "linear",
      duration_intent: "brief",
      timing: "during_speech",
    });
  }

  return {
    version: "0.1",
    title: `Fixed sample: ${capability}`,
    goals: ["Explain the visual relation", "Let the learner inspect it"],
    ...(hasNumber ? {
      numbers: [{
        initial: capability === "coordinate_circle" ? 1 : 0,
        min: capability === "coordinate_circle" ? 0.25 : capability === "geometric_rearrangement" ? 0 : -1,
        max: capability === "coordinate_circle" ? 3 : 1,
        label: "main value",
        student_control: { kind: "slider", step: 0.05 },
      }],
    } : {}),
    sections: [
      {
        purpose: "Create the reusable visual",
        reusable_items: [{
          kind: "board_item",
          board_kind: "visual",
          capability,
        }],
        moments: [{
          narration: `Here is the ${capability} visual.`,
          delivery: "patient",
          actions: firstMomentActions,
        }],
        ...(is3d ? {
          student_activities: [{
            kind: "scene3d_view",
            reference: reusable(1, 1),
            prompt: "Rotate the scene to the requested view.",
            controls: ["orbit", "zoom", "reset"],
            match: "view_direction",
            yaw: 0,
            pitch: 0,
            zoom: 1,
            angular_tolerance: 0.15,
            zoom_tolerance: 0.2,
            hints: ["Use orbit first."],
          }],
        } : hasNumber ? {
          student_activities: [{
            kind: "number_target",
            prompt: "Move the main value to one half.",
            number_controls: [{ number: 1, controls: ["slider"] }],
            value: 0.5,
            tolerance: 0.02,
            hints: ["Watch the numeric value."],
          }],
        } : {}),
      },
      {
        purpose: "Return to the old visual and add an explanation",
        moments: [{
          narration: "Now return to the visual created in the previous section.",
          actions: [
            {
              action: "point_at",
              reference: reusable(1, 1, { kind: "capability", role: "whole" }),
            },
            {
              action: "create",
              kind: "text",
              role: "follow_up_explanation",
              content: { text: "This text is placed beside the old visual." },
              placement: {
                relation: "right_of",
                reference: reusable(1, 1),
                gap: "normal",
              },
            },
            {
              action: "focus",
              references: [reusable(1, 1), localBoardItem(1, 1)],
              intent: "keep the old visual and new explanation visible",
            },
          ],
        }],
      },
    ],
    close: {
      summary: "Review the main visual.",
      focus: [reusable(1, 1)],
    },
  };
}

test("every registered visual capability has a fixed valid Lesson Plan sample", () => {
  assert.equal(capabilities.length, 9);
  assert.deepEqual([...LESSON_PLAN_CAPABILITY_NAMES].sort(), [...capabilities].sort());
  for (const capability of capabilities) {
    assert.deepEqual(
      LESSON_PLAN_CAPABILITIES[capability],
      LESSON_PLAN_CAPABILITY_REGISTRY[capability].parts,
      capability,
    );
    assert.deepEqual(
      LESSON_PLAN_CAPABILITY_NUMBER_INPUTS[capability],
      LESSON_PLAN_CAPABILITY_REGISTRY[capability].number_inputs,
      capability,
    );
  }
  for (const capability of capabilities) {
    const resolved = resolveLessonPlan(samplePlan(capability));
    assert.equal(
      resolved.sections[0].reusable_items[0].target_id,
      "section-01-moment-01-item-01",
      capability,
    );
    assert.equal(
      resolved.references.at(-1).target_id,
      "section-01-moment-01-item-01",
      capability,
    );
  }
});

test("all fixed capability samples compile through the complete OLL validation pipeline", () => {
  const expectedKinds = {
    function_plot: ["plot"],
    unit_circle_projection: ["geometry", "plot"],
    circle_and_arc: ["geometry"],
    spring_and_mass: ["geometry", "plot"],
    cube_with_section: ["scene3d"],
    function_surface_with_section: ["scene3d"],
    coordinate_circle: ["geometry"],
    geometric_rearrangement: ["geometry"],
    process_diagram: ["diagram"],
  };
  for (const capability of capabilities) {
    const compiled = compileAndValidateLessonPlan(samplePlan(capability));
    assert.equal(compiled.lesson.steps.length, 2, capability);
    assert.ok(compiled.lesson.steps[0].beats[0].actions.length >= 2, capability);
    const writtenKinds = compiled.lesson.steps[0].beats[0].actions
      .filter((action) => action.do === "write")
      .map((action) => action.kind);
    assert.deepEqual(writtenKinds, expectedKinds[capability], capability);
  }
  assert.deepEqual(Object.keys(expectedKinds).sort(), [...capabilities].sort());
});

test("process diagrams cannot advertise a numeric control they do not implement", () => {
  const plan = samplePlan("process_diagram");
  plan.numbers = [{
    initial: 0,
    min: 0,
    max: 1,
    label: "fake progress",
    student_control: { kind: "slider", step: 0.1 },
  }];
  plan.sections[0].moments[0].actions[0].content.numbers = [1];
  plan.sections[0].moments[0].actions.push({
    action: "animate",
    number: 1,
    end_value: 1,
  });
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
  );
});

test("mentioning a variable without changing the visual is still rejected", () => {
  const plan = samplePlan("function_plot");
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression_tokens: [
      { kind: "input" },
      { kind: "number", number: 1 },
      { kind: "number", number: 1 },
      { kind: "operator", operator: "subtract" },
      { kind: "operator", operator: "add" },
    ],
  };
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_COMPILED_NO_EFFECT"
      && /does not change/.test(error.message),
  );
});

test("coordinate circle radius controls are compiled into a real visual binding", () => {
  const compiled = compileAndValidateLessonPlan(samplePlan("coordinate_circle"));
  const geometry = compiled.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "geometry",
  );
  assert.deepEqual(geometry.content.bindings, [
    { target: "circle.radius", expression: "number_01" },
  ]);
});

test("geometric rearrangement moves congruent pieces with deterministic bindings", () => {
  const compiled = compileAndValidateLessonPlan(samplePlan("geometric_rearrangement"));
  const geometry = compiled.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "geometry",
  );
  assert.equal(geometry.content.bindings.length, 24);
  const piece2Y = geometry.content.bindings.find(
    (binding) => binding.target === "piece-2-point-1.y",
  );
  const piece3X = geometry.content.bindings.find(
    (binding) => binding.target === "piece-3-point-1.x",
  );
  assert.equal(evaluateMathExpression(piece2Y.expression, { number_01: 1 }), 2);
  assert.equal(evaluateMathExpression(piece3X.expression, { number_01: 1 }), 3);
});

test("every registered rearrangement recipe preserves each rigid piece at every progress value", () => {
  for (const construction of LESSON_PLAN_CAPABILITY_REGISTRY
    .geometric_rearrangement.parameter_options.construction) {
    const plan = samplePlan("geometric_rearrangement");
    plan.sections[0].moments[0].actions[0].content.parameters = {
      construction,
      leg_a: 3,
      leg_b: 2,
    };
    const compiled = compileAndValidateLessonPlan(plan);
    const geometry = compiled.lesson.steps[0].beats[0].actions.find(
      (action) => action.do === "write" && action.kind === "geometry",
    );
    const bindings = new Map(geometry.content.bindings.map((binding) => [binding.target, binding.expression]));
    const pointByAlias = new Map(geometry.content.points.map((point) => [point.as, point]));
    assert.ok(geometry.content.polygons.length >= 3, construction);

    for (const polygon of geometry.content.polygons.filter((candidate) => candidate.as.startsWith("piece-"))) {
      const coordinatesAt = (progress) => polygon.points.map((pointAlias) => {
        const point = pointByAlias.get(pointAlias);
        const xExpression = bindings.get(`${pointAlias}.x`);
        const yExpression = bindings.get(`${pointAlias}.y`);
        return [
          xExpression ? evaluateMathExpression(xExpression, { number_01: progress }) : point.x,
          yExpression ? evaluateMathExpression(yExpression, { number_01: progress }) : point.y,
        ];
      });
      const sideLengthsAt = (progress) => {
        const coordinates = coordinatesAt(progress);
        return coordinates.map(([x, y], index) => {
          const [nextX, nextY] = coordinates[(index + 1) % coordinates.length];
          return Math.hypot(nextX - x, nextY - y);
        });
      };
      const baseline = sideLengthsAt(0);
      for (const progress of [0.25, 0.5, 0.75, 1]) {
        const current = sideLengthsAt(progress);
        current.forEach((length, index) => {
          assert.ok(Math.abs(length - baseline[index]) < 1e-9, `${construction}/${polygon.as}/${progress}`);
        });
      }
    }
    if (construction === "triangle_to_rectangle") {
      assert.ok([...bindings.values()].some((expression) => expression.includes("cos(")));
      assert.ok([...bindings.values()].some((expression) => expression.includes("sin(")));
    }
  }
});

test("circle and arc converts degree controls to radians and binds radius to every dependent shape", () => {
  const plan = samplePlan("circle_and_arc");
  plan.numbers = [
    {
      initial: 60,
      min: 1,
      max: 360,
      label: "圆心角 n",
      unit: "度",
      student_control: { kind: "slider", step: 1 },
    },
    {
      initial: 5,
      min: 1,
      max: 10,
      label: "半径 r",
      unit: "cm",
      student_control: { kind: "slider", step: 0.5 },
    },
  ];
  const create = plan.sections[0].moments[0].actions[0];
  create.content.numbers = [1, 2];
  plan.sections[0].moments[0].actions[2].end_value = 120;
  plan.sections[0].student_activities[0].number_controls = [{ number: 2, controls: ["slider"] }];
  plan.sections[0].student_activities[0].value = 6;

  const compiled = compileAndValidateLessonPlan(plan);
  const geometry = compiled.lesson.steps[0].beats[0].actions
    .find((action) => action.do === "write" && action.kind === "geometry").content;
  const movingPoint = geometry.points.find((point) => point.as === "moving-point");
  assert.ok(Math.abs(movingPoint.x - 2.5) < 1e-9);
  assert.ok(Math.abs(movingPoint.y - (5 * Math.sqrt(3)) / 2) < 1e-9);
  assert.deepEqual(
    movingPoint.interaction,
    { kind: "angle_control", variable: "number_01", center: "center" },
    "direct dragging must write back using the variable's declared angle unit",
  );
  assert.equal(geometry.axes.x.max, 12.5);
  assert.deepEqual(
    geometry.bindings,
    [
      { target: "moving-point.x", expression: "number_02*cos((number_01)*pi/180)" },
      { target: "moving-point.y", expression: "number_02*sin((number_01)*pi/180)" },
      { target: "arc.end_angle", expression: "(number_01)*pi/180" },
      { target: "circle.radius", expression: "number_02" },
      { target: "arc.radius", expression: "number_02" },
    ],
  );
});

test("unit circle projection keeps degree controls in range across both linked views", () => {
  const plan = samplePlan("unit_circle_projection");
  plan.numbers = [{
    initial: 85,
    min: 0,
    max: 360,
    label: "旋转角度",
    unit: "度",
    student_control: { kind: "slider", step: 1 },
  }];
  plan.sections[0].moments[0].actions[0].content.numbers = [1];
  plan.sections[0].moments[0].actions[2].end_value = 178;
  plan.sections[0].student_activities[0].value = 90;
  plan.sections[0].student_activities[0].tolerance = 1;

  const compiled = compileAndValidateLessonPlan(plan);
  const writes = compiled.lesson.steps[0].beats[0].actions.filter((action) => action.do === "write");
  const geometry = writes.find((action) => action.kind === "geometry").content;
  const plot = writes.find((action) => action.kind === "plot").content;
  assert.deepEqual(geometry.bindings, [
    { target: "moving-point.x", expression: "cos((number_01)*pi/180)" },
    { target: "moving-point.y", expression: "sin((number_01)*pi/180)" },
    { target: "projection-foot.x", expression: "cos((number_01)*pi/180)" },
    { target: "angle.end_angle", expression: "(number_01)*pi/180" },
  ]);
  assert.deepEqual(plot.bindings, [
    { target: "moving-point.x", expression: "(number_01)*pi/180" },
    { target: "moving-point.y", expression: "sin((number_01)*pi/180)" },
  ]);

  for (const degrees of [0, 1, 85, 90, 178, 180, 270, 359, 360]) {
    const radians = degrees * Math.PI / 180;
    const value = (bindings, target) => evaluateMathExpression(
      bindings.find((binding) => binding.target === target).expression,
      { number_01: degrees },
    );
    const circleX = value(geometry.bindings, "moving-point.x");
    const circleY = value(geometry.bindings, "moving-point.y");
    const projectionX = value(geometry.bindings, "projection-foot.x");
    const arcEnd = value(geometry.bindings, "angle.end_angle");
    const plotX = value(plot.bindings, "moving-point.x");
    const plotY = value(plot.bindings, "moving-point.y");
    assert.ok(Math.abs(circleX - Math.cos(radians)) < 1e-9, `circle x at ${degrees}°`);
    assert.ok(Math.abs(circleY - Math.sin(radians)) < 1e-9, `circle y at ${degrees}°`);
    assert.ok(Math.abs(projectionX - Math.cos(radians)) < 1e-9, `projection at ${degrees}°`);
    assert.ok(Math.abs(arcEnd - radians) < 1e-9, `arc at ${degrees}°`);
    assert.ok(Math.abs(plotX - radians) < 1e-9, `plot x at ${degrees}°`);
    assert.ok(Math.abs(plotY - Math.sin(radians)) < 1e-9, `plot y at ${degrees}°`);
    assert.ok(plotX >= plot.axes.x.min && plotX <= plot.axes.x.max, `plot point visible at ${degrees}°`);
  }
});

test("installed visual capabilities normalize executable numeric ranges without a model retry", () => {
  const cube = structuredClone(completeLessonPlanFixtures.cube_and_section);
  Object.assign(cube.numbers[0], { min: -10, max: 10, initial: 5 });
  const compiledCube = compileAndValidateLessonPlan(cube).lesson;
  assert.deepEqual(
    {
      min: compiledCube.lesson.variables[0].min,
      max: compiledCube.lesson.variables[0].max,
      initial: compiledCube.lesson.variables[0].initial,
    },
    { min: -1, max: 1, initial: 1 },
  );
  assert.equal(compiledCube.lesson.variables[0].control.step, 0.01);

  const surface = structuredClone(completeLessonPlanFixtures.paraboloid_section);
  Object.assign(surface.numbers[0], { min: -100, max: 100, initial: 50 });
  const compiledSurface = compileAndValidateLessonPlan(surface).lesson;
  assert.deepEqual(
    {
      min: compiledSurface.lesson.variables[0].min,
      max: compiledSurface.lesson.variables[0].max,
      initial: compiledSurface.lesson.variables[0].initial,
    },
    { min: 0, max: 8, initial: 8 },
  );

  const radius = samplePlan("coordinate_circle");
  Object.assign(radius.numbers[0], { min: -5, max: 5, initial: -2 });
  const compiledRadius = compileAndValidateLessonPlan(radius).lesson.lesson.variables[0];
  assert.ok(compiledRadius.min > 0);
  assert.ok(compiledRadius.initial >= compiledRadius.min);
});

test("a slider cannot expose an impractical number of indistinguishable steps", () => {
  const plan = samplePlan("function_plot");
  plan.numbers[0] = {
    initial: 1,
    min: 1,
    max: 10_000,
    label: "sample index",
    student_control: { kind: "slider", step: 1 },
  };
  plan.sections[0].moments[0].actions.find(
    (action) => action.action === "animate",
  ).end_value = 2;
  plan.sections[0].student_activities[0].value = 2;
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_CONTROL_RESOLUTION",
  );

  const outline = {
    version: "0.1",
    title: "数值控件检查",
    goals: ["检查滑杆分辨率"],
    numbers: [plan.numbers[0]],
    sections: [{ purpose: "展示数值", allowed_capabilities: [] }],
    close: { summary: "检查完成" },
  };
  assert.throws(
    () => validateLessonPlanOutline(outline),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_CONTROL_RESOLUTION"
      && error.path === "$lessonPlanOutline.numbers[0].student_control.step",
  );
});

test("spring phase uses the same degree-to-radian rule as other angular visuals", () => {
  const plan = samplePlan("spring_and_mass");
  plan.numbers = [{
    initial: 180,
    min: 0,
    max: 360,
    label: "振动相位",
    unit: "度",
    student_control: { kind: "slider", step: 1 },
  }];
  plan.sections[0].moments[0].actions[2].end_value = 270;
  plan.sections[0].student_activities[0].value = 90;
  plan.sections[0].student_activities[0].tolerance = 1;

  const compiled = compileAndValidateLessonPlan(plan);
  const writes = compiled.lesson.steps[0].beats[0].actions.filter((action) => action.do === "write");
  const geometry = writes.find((action) => action.kind === "geometry").content;
  const plot = writes.find((action) => action.kind === "plot").content;
  assert.deepEqual(geometry.bindings, [
    { target: "mass.x", expression: "cos((number_01)*pi/180)" },
    { target: "force-tip.x", expression: "0.5*cos((number_01)*pi/180)" },
  ]);
  assert.deepEqual(plot.bindings, [
    { target: "moving-point.x", expression: "(number_01)*pi/180" },
    { target: "moving-point.y", expression: "cos((number_01)*pi/180)" },
  ]);
  assert.ok(Math.abs(geometry.points.find((point) => point.as === "mass").x + 1) < 1e-9);
  assert.ok(Math.abs(plot.points.find((point) => point.as === "moving-point").x - Math.PI) < 1e-9);
});

test("equivalent visuals in later sections reuse the first rendered board item", () => {
  const plan = samplePlan("circle_and_arc");
  plan.numbers.push({
    initial: 5,
    min: 1,
    max: 10,
    label: "radius",
    student_control: { kind: "slider", step: 0.5 },
  });
  plan.sections[1].moments.push({
    narration: "继续观察同一个圆。",
    actions: [{
      action: "create",
      kind: "visual",
      role: "same_circle_again",
      content: {
        capability: "circle_and_arc",
        parameters: { title: "换了标题但结构与状态相同" },
        numbers: [1, 2],
      },
      placement: { relation: "new_region" },
    }],
  });

  const compiled = compileAndValidateLessonPlan(plan);
  const writes = compiled.lesson.steps.flatMap((step) => step.beats)
    .flatMap((beat) => beat.actions)
    .filter((action) => action.do === "write" && action.kind === "geometry");
  assert.equal(writes.length, 1);
  assert.ok(writes[0].content.bindings.some((binding) =>
    binding.target === "circle.radius" && binding.expression === "number_02"));
  assert.deepEqual(compiled.lesson.steps[1].beats[1].actions, [{
    do: "focus",
    targets: ["section-01-moment-01-item-01"],
    intent: "继续观察已有的同一画面",
  }]);
});

test("presentation-only changes do not duplicate any current cross-subject visual capability", () => {
  for (const capability of capabilities) {
    const plan = samplePlan(capability);
    const baselineLesson = compileAndValidateLessonPlan(structuredClone(plan)).lesson;
    const baselineVisualWrites = baselineLesson.steps.flatMap((step) => step.beats)
      .flatMap((beat) => beat.actions)
      .filter((action) => action.do === "write"
        && ["plot", "geometry", "scene3d", "diagram"].includes(action.kind));
    const original = plan.sections[0].moments[0].actions[0].content;
    const duplicate = structuredClone(original);
    duplicate.parameters = {
      ...(duplicate.parameters ?? {}),
      title: "A different title and viewing setup",
      ...(["function_plot", "function_surface_with_section"].includes(capability)
        ? { x_min: -9, x_max: 7, y_min: -8, y_max: 12 }
        : {}),
      ...(capability === "function_surface_with_section" ? { samples: 18 } : {}),
    };
    plan.sections[0].moments.push({
      narration: "Continue using the same teaching object.",
      delivery: "patient",
      actions: [{
        action: "create",
        kind: "visual",
        role: "same_object_with_different_presentation",
        content: duplicate,
        placement: { relation: "new_region" },
      }],
    });
    const lesson = compileAndValidateLessonPlan(plan).lesson;
    const visualWrites = lesson.steps.flatMap((step) => step.beats)
      .flatMap((beat) => beat.actions)
      .filter((action) => action.do === "write"
        && ["plot", "geometry", "scene3d", "diagram"].includes(action.kind));
    assert.equal(visualWrites.length, baselineVisualWrites.length, capability);
  }
});

test("an explicit comparison may keep two otherwise equivalent views separate", () => {
  const plan = samplePlan("function_plot");
  plan.sections[0].moments.push({
    narration: "Compare a second view side by side.",
    delivery: "careful",
    actions: [{
      action: "create",
      kind: "visual",
      role: "comparison_view",
      content: {
        capability: "function_plot",
        parameters: { title: "Detailed comparison", expression: "x^3", x_min: -1, x_max: 1 },
        numbers: [1],
      },
      placement: { relation: "new_region" },
      distinct_visual: true,
    }],
  });
  const lesson = compileAndValidateLessonPlan(plan).lesson;
  const plots = lesson.steps.flatMap((step) => step.beats)
    .flatMap((beat) => beat.actions)
    .filter((action) => action.do === "write" && action.kind === "plot");
  assert.equal(plots.length, 2);
});

test("a comparison label cannot turn a presentation-only change into a second visual", () => {
  const plan = samplePlan("function_plot");
  const duplicate = structuredClone(plan.sections[0].moments[0].actions[0].content);
  duplicate.parameters = {
    ...(duplicate.parameters ?? {}),
    title: "Only the title and viewport changed",
    x_min: -20,
    x_max: 20,
  };
  plan.sections[0].moments.push({
    narration: "Compare this second view.",
    delivery: "careful",
    actions: [{
      action: "create",
      kind: "visual",
      role: "invalid_comparison_view",
      content: duplicate,
      placement: { relation: "new_region" },
      distinct_visual: true,
    }],
  });

  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_COURSE_VISUAL",
  );
});

test("an animated or assessed number must drive at least one visual", () => {
  const plan = samplePlan("circle_and_arc");
  plan.sections[0].moments[0].actions[0].content.numbers = [];
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_UNBOUND_NUMBER",
  );

  const staticMultiNumberPlot = structuredClone(completeLessonPlanFixtures.quadratic_translation);
  const visual = staticMultiNumberPlot.sections[0].moments[0].actions[0].content;
  delete visual.parameters.expression_tokens;
  visual.parameters.expression = "x^2";
  assert.throws(
    () => compileAndValidateLessonPlan(staticMultiNumberPlot),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_EXPRESSION"
      && /change the whole curve/u.test(error.message),
  );
});

test("eight complete previously tested courses compile without model-authored identity", () => {
  assert.equal(Object.keys(completeLessonPlanFixtures).length, 8);
  for (const [name, plan] of Object.entries(completeLessonPlanFixtures)) {
    const compiled = compileAndValidateLessonPlan(plan);
    assert.equal(compiled.lesson.steps.length, 3, name);
    assert.equal(compiled.lesson.steps[1].beats[0].say.includes("保留刚才的画面"), true, name);
    assert.equal(compiled.lesson.lesson.variables[0].as, "number_01", name);
    assert.equal(compiled.lesson.close.focus[0], "section-01-moment-01-item-01", name);
  }
  assert.deepEqual(
    compileAndValidateLessonPlan(completeLessonPlanFixtures.natural_log_origin).lesson.lesson.adaptation.strategies,
    ["先用反函数建立直觉，再用面积定义解释运算规律"],
  );
});

test("quadratic translation uses h and k to move the entire compiled curve", () => {
  const compiled = compileAndValidateLessonPlan(completeLessonPlanFixtures.quadratic_translation).lesson;
  assert.deepEqual(
    compiled.lesson.variables.map((variable) => variable.as),
    ["number_01", "number_02"],
  );
  const plot = compiled.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  const expression = plot.content.curves[0].expression;
  assert.equal(plot.content.points, undefined, "h and k must drive the curve, not a detached moving point");
  assert.equal(plot.content.bindings, undefined);
  for (const [h, k] of [[0, 0], [2, -1], [-3, 4], [5, -5]]) {
    assert.equal(
      evaluateMathExpression(expression, { x: h, number_01: h, number_02: k }),
      k,
      `the vertex must be (${h}, ${k})`,
    );
    assert.equal(
      evaluateMathExpression(expression, { x: h + 1, number_01: h, number_02: k }),
      k + 1,
      "translation must preserve the parabola's shape",
    );
  }
  assert.equal(compiled.lesson.tasks.length, 2);
  assert.deepEqual(
    compiled.lesson.tasks.map((task) => task.completion.expression),
    ["number_01", "number_02"],
  );
  assert.deepEqual(
    compiled.lesson.tasks.map((task) => task.completion.value),
    [2, -1],
  );
});

test("quadratic translation remains correct across deterministic random parameter combinations", () => {
  const compiled = compileAndValidateLessonPlan(completeLessonPlanFixtures.quadratic_translation).lesson;
  const plot = compiled.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  const expression = plot.content.curves[0].expression;
  let state = 0x51a7c0de;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = 0; index < 200; index += 1) {
    const h = -5 + random() * 10;
    const k = -5 + random() * 10;
    const offset = -6 + random() * 12;
    const variables = { x: h + offset, number_01: h, number_02: k };
    const actual = evaluateMathExpression(expression, variables);
    const expected = offset ** 2 + k;
    assert.ok(
      Math.abs(actual - expected) < 1e-9,
      `case ${index}: expected (${h} + ${offset} - ${h})^2 + ${k} = ${expected}, got ${actual}`,
    );

    const left = evaluateMathExpression(expression, {
      x: h - Math.abs(offset),
      number_01: h,
      number_02: k,
    });
    const right = evaluateMathExpression(expression, {
      x: h + Math.abs(offset),
      number_01: h,
      number_02: k,
    });
    assert.ok(Math.abs(left - right) < 1e-9, `case ${index}: translation must preserve symmetry`);
  }
});

test("a function curve supports exactly the declared maximum of four numeric parameters", () => {
  const plan = samplePlan("function_plot");
  plan.numbers = Array.from({ length: 4 }, (_, index) => ({
    initial: 0,
    min: -1,
    max: 1,
    label: `parameter ${index + 1}`,
    student_control: { kind: "slider", step: 0.1 },
  }));
  plan.sections[0].moments[0].actions[0].content.numbers = [1, 2, 3, 4];
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression_tokens: [
      { kind: "input" },
      { kind: "number", number: 1 },
      { kind: "operator", operator: "add" },
      { kind: "number", number: 2 },
      { kind: "operator", operator: "add" },
      { kind: "number", number: 3 },
      { kind: "operator", operator: "add" },
      { kind: "number", number: 4 },
      { kind: "operator", operator: "add" },
    ],
  };

  const compiled = compileAndValidateLessonPlan(plan).lesson;
  const plot = compiled.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.equal(
    evaluateMathExpression(plot.content.curves[0].expression, {
      x: 10,
      number_01: 1,
      number_02: 2,
      number_03: 3,
      number_04: 4,
    }),
    20,
  );
  assert.equal(compiled.lesson.variables.length, 4);

  const tooMany = structuredClone(plan);
  tooMany.numbers.push({
    initial: 0,
    min: -1,
    max: 1,
    label: "parameter 5",
    student_control: { kind: "slider", step: 0.1 },
  });
  tooMany.sections[0].moments[0].actions[0].content.numbers.push(5);
  tooMany.sections[0].moments[0].actions[0].content.parameters.expression_tokens.push(
    { kind: "number", number: 5 },
    { kind: "operator", operator: "add" },
  );
  assert.throws(
    () => compileAndValidateLessonPlan(tooMany),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
  );
});

test("one function plot can render several static explicit curves without inventing controls", () => {
  const plan = samplePlan("function_plot");
  delete plan.numbers;
  delete plan.sections[0].moments[0].actions[0].content.numbers;
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expressions: ["x", "x^2", "sin(x)"],
    curve_labels: ["y = x", "y = x^2", "y = sin(x)"],
  };
  plan.sections[0].moments[0].actions = plan.sections[0].moments[0].actions.filter(
    (action) => action.action !== "animate",
  );
  delete plan.sections[0].student_activities;

  const compiled = compileAndValidateLessonPlan(plan).lesson;
  const plot = compiled.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.deepEqual(
    plot.content.curves.map((curve) => [curve.expression, curve.label]),
    [
      ["x", "y = x"],
      ["x^2", "y = x^2"],
      ["sin(x)", "y = sin(x)"],
    ],
  );
  assert.equal(plot.content.points, undefined);
  assert.equal(compiled.lesson.variables, undefined);
});

test("the mathematical structure distinguishes a moving point from a changing curve", () => {
  const pointPlan = samplePlan("function_plot");
  const pointPlot = compileAndValidateLessonPlan(pointPlan).lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.equal(pointPlot.content.curves[0].expression, "x^2");
  assert.equal(pointPlot.content.points[0].as, "moving-point");

  const curvePlan = samplePlan("function_plot");
  curvePlan.sections[0].moments[0].actions[0].content.parameters = {
    expression_tokens: [
      { kind: "number", number: 1 },
      { kind: "input" },
      { kind: "literal", value: 2 },
      { kind: "operator", operator: "power" },
      { kind: "operator", operator: "multiply" },
    ],
  };
  const curvePlot = compileAndValidateLessonPlan(curvePlan).lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.match(curvePlot.content.curves[0].expression, /number_01/u);
  assert.equal(curvePlot.content.points, undefined);
});

test("a function plot never silently falls back to an unrelated quadratic", () => {
  const plan = samplePlan("function_plot");
  delete plan.sections[0].moments[0].actions[0].content.parameters.expression;
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_EXPRESSION"
      && /explicit mathematical expression/u.test(error.message),
  );
});

test("the compiler expands a plot axis to keep a moving point visible", () => {
  const plan = samplePlan("function_plot");
  plan.numbers[0] = {
    initial: 1,
    min: 1,
    max: 100,
    label: "sample index",
    student_control: { kind: "slider", step: 1 },
  };
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression: "(1+1/x)^x",
    x_min: 1,
    x_max: 4,
    y_min: 1,
    y_max: 3,
  };
  plan.sections[0].moments[0].actions.find(
    (action) => action.action === "animate",
  ).end_value = 2;
  plan.sections[0].student_activities[0].value = 2;
  const plot = compileAndValidateLessonPlan(plan).lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  ).content;
  assert.deepEqual(plot.axes.x, { min: 1, max: 100, label: "x" });
  assert.equal(plot.points[0].x, 1);
  assert.equal(plot.bindings[0].expression, "number_01");
});

test("a lesson number cannot silently replace the horizontal-axis input", () => {
  const plan = samplePlan("function_plot");
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression_tokens: [
      { kind: "literal", value: 1 },
      { kind: "literal", value: 1 },
      { kind: "number", number: 1 },
      { kind: "operator", operator: "divide" },
      { kind: "operator", operator: "add" },
      { kind: "number", number: 1 },
      { kind: "operator", operator: "power" },
    ],
  };
  assert.throws(
    () => compileAndValidateLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_PLOT_INPUT",
  );
});

test("a one-variable sequence curve uses x while the lesson number moves one point", () => {
  const plan = samplePlan("function_plot");
  plan.numbers[0] = {
    initial: 1,
    min: 1,
    max: 100,
    label: "sample index n",
    student_control: { kind: "slider", step: 1 },
  };
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression: "(1+1/x)^x",
    x_min: 1,
    x_max: 100,
    y_min: 1.9,
    y_max: 2.8,
  };
  plan.sections[0].moments[0].actions.find(
    (action) => action.action === "animate",
  ).end_value = 100;
  plan.sections[0].student_activities[0].value = 100;

  const plot = compileAndValidateLessonPlan(plan).lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  ).content;
  assert.equal(plot.curves[0].expression, "(1+1/x)^x");
  assert.deepEqual(plot.bindings, [
    { target: "moving-point.x", expression: "number_01" },
    { target: "moving-point.y", expression: "(1+1/number_01)^number_01" },
  ]);
});

test("canonical function tokens can describe a one-variable sequence without turning the slider into a curve parameter", () => {
  const plan = samplePlan("function_plot");
  plan.numbers[0] = {
    initial: 1,
    min: 1,
    max: 100,
    label: "复利结算次数 n",
    student_control: { kind: "slider", step: 1 },
  };
  plan.sections[0].moments[0].actions[0].content.parameters = {
    expression_tokens: [
      { kind: "literal", value: 1 },
      { kind: "literal", value: 1 },
      { kind: "input" },
      { kind: "operator", operator: "divide" },
      { kind: "operator", operator: "add" },
      { kind: "input" },
      { kind: "operator", operator: "power" },
    ],
    x_min: 1,
    x_max: 100,
    y_min: 1.9,
    y_max: 2.8,
  };
  plan.sections[0].moments[0].actions.find(
    (action) => action.action === "animate",
  ).end_value = 100;
  plan.sections[0].student_activities[0].value = 100;

  const plot = compileAndValidateLessonPlan(plan).lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  ).content;
  assert.equal(plot.curves[0].expression, "((1)+((1)/(x)))^(x)");
  assert.deepEqual(plot.bindings, [
    { target: "moving-point.x", expression: "number_01" },
    { target: "moving-point.y", expression: "((1)+((1)/(number_01)))^(number_01)" },
  ]);
});

test("independently generated section drafts assemble by numeric position, not by names or completion order", () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    course_visuals: [{
      capability: "unit_circle_projection",
      create_section: 1,
      use_sections: [1, 2, 3],
      relation: "primary",
      reusable_item: 1,
    }],
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => ({
    version: "0.1",
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  })).reverse();
  const assembled = assembleLessonPlan(outline, drafts);
  assert.deepEqual(assembled, plan);
  const compiled = compileAndValidateLessonPlan(assembled);
  assert.equal(compiled.lesson.steps[0].key, "section-01");
  assert.equal(compiled.lesson.steps[2].key, "section-03");

  assert.throws(
    () => assembleLessonPlan(outline, drafts.slice(1)),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_SECTION_DRAFTS",
  );
  const duplicate = structuredClone(drafts);
  duplicate[0].section = duplicate[1].section;
  assert.throws(
    () => assembleLessonPlan(outline, duplicate),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_SECTION_DRAFTS",
  );

  const unstableClose = structuredClone(outline);
  unstableClose.close.focus = [{ source: "local_board_item", moment: 1, item: 1 }];
  assert.throws(
    () => assembleLessonPlan(unstableClose, drafts),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_OUTLINE_REFERENCE",
  );
});

test("model-facing outline and section schemas stay small, flat, and free of business identity fields", () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    course_visuals: [{
      capability: "unit_circle_projection",
      create_section: 1,
      use_sections: [1, 2, 3],
      relation: "primary",
      reusable_item: 1,
    }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  const outlineSchema = buildLessonPlanOutlineJsonSchema();
  const bootstrapSchema = buildLessonPlanBootstrapJsonSchema();
  const firstSectionSchema = buildLessonPlanSectionDraftJsonSchema(outline, 1);
  const textOnlySectionSchema = buildLessonPlanSectionDraftJsonSchema(outline, 2);
  const encoded = JSON.stringify({ outlineSchema, bootstrapSchema, firstSectionSchema, textOnlySectionSchema });
  assert.equal(encoded.includes("anyOf"), false);
  assert.equal(encoded.includes("oneOf"), false);
  assert.equal(encoded.includes("exclusiveMinimum"), false);
  assert.equal(encoded.includes("minLength"), false);
  assert.equal(encoded.includes("maxLength"), false);
  assert.equal(encoded.includes("minItems"), false);
  assert.equal(encoded.includes("maxItems"), false);
  assert.ok(JSON.stringify(outlineSchema).length < 8_000);
  assert.ok(JSON.stringify(firstSectionSchema).length < 16_000);

  const forbiddenKeys = new Set(["id", "as", "key", "target", "targets", "anchor", "variable", "bindings", "from", "to"]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.properties) {
      for (const key of Object.keys(value.properties)) assert.equal(forbiddenKeys.has(key), false, key);
      for (const required of value.required ?? []) assert.equal(required in value.properties, true, required);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(outlineSchema);
  visit(firstSectionSchema);
  const requiredVisual = firstSectionSchema.properties.course_visual_creates
    .properties.visual_1;
  assert.ok(firstSectionSchema.required.includes("course_visual_creates"));
  assert.ok(firstSectionSchema.properties.course_visual_creates.required.includes("visual_1"));
  assert.equal("capability" in requiredVisual.properties.content.properties, false);
  const modelMoment = firstSectionSchema.properties.moments.items.properties;
  assert.equal("references" in modelMoment.focuses.items.properties, false);
  assert.equal("reference" in modelMoment.points.items.properties, false);
  assert.equal(
    outlineSchema.properties.numbers.items.properties.initial.$ref,
    "#/$defs/modelDecimal",
  );
  assert.equal("student_control" in outlineSchema.properties.numbers.items.properties, false);
  assert.equal(
    firstSectionSchema.properties.moments.items.properties.animations.items.properties.end_value.$ref,
    "#/$defs/modelDecimal",
  );
  assert.deepEqual(outlineSchema.$defs.modelDecimal.required, ["mantissa", "scale"]);
  const firstVisualParameters = requiredVisual.properties.content.properties.parameters.properties;
  assert.deepEqual(Object.keys(firstVisualParameters).sort(), ["projection", "title"]);
  for (const programOwnedKey of [
    "samples", "x_min", "x_max", "y_min", "y_max",
    "angular_tolerance_degrees", "zoom_tolerance_percent",
    "hint_after_attempts", "easing", "align", "gap",
  ]) {
    assert.equal(encoded.includes(`\"${programOwnedKey}\"`), false, programOwnedKey);
  }
  const textOnlyActions = textOnlySectionSchema.properties.moments.items.properties;
  assert.equal("visual_creates" in textOnlyActions, false);
  assert.ok("math_creates" in textOnlyActions);

  const drafts = plan.sections.map(({ moments, student_activities }, index) => ({
    version: "0.1",
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const invalid = structuredClone(drafts);
  invalid[0].moments[0].actions[0].content.capability = "cube_with_section";
  assert.throws(
    () => assembleLessonPlan(outline, invalid),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_CAPABILITY",
  );
});

test("formal section generation cannot assign reusable board positions", () => {
  const outlineSchema = buildLessonPlanOutlineJsonSchema();
  const modelReusable = outlineSchema.properties.sections.items.properties.reusable_items.items;
  assert.deepEqual(modelReusable.properties.kind.enum, ["board_item"]);
  assert.deepEqual(modelReusable.properties.board_kind.enum, ["math", "note"]);

  const outline = {
    version: "0.1",
    title: "几何重排",
    goals: ["解释面积关系"],
    numbers: [{ initial: 0, min: 0, max: 1, student_control: { kind: "slider", step: 0.01 } }],
    course_visuals: [{
      capability: "geometric_rearrangement",
      create_section: 2,
      use_sections: [2, 3],
      relation: "primary",
      reusable_item: 3,
    }],
    sections: [
      { purpose: "提出问题", allowed_capabilities: [], reusable_items: [] },
      {
        purpose: "完成重排",
        allowed_capabilities: ["geometric_rearrangement"],
        reusable_items: [
          { kind: "board_item", board_kind: "math" },
          { kind: "board_item", board_kind: "note" },
          { kind: "board_item", board_kind: "visual", capability: "geometric_rearrangement" },
        ],
      },
      { purpose: "总结", allowed_capabilities: [], reusable_items: [] },
    ],
    close: { summary: "面积保持不变。", focus: [{ source: "reusable", section: 2, item: 3 }] },
  };
  const schema = buildLessonPlanSectionDraftJsonSchema(outline, 2);
  assert.ok(schema.required.includes("reusable_board_creates"));
  assert.deepEqual(schema.properties.reusable_board_creates.required, ["item_1", "item_2"]);
  assert.deepEqual(
    Object.keys(schema.properties.reusable_board_creates.properties.item_1.properties.content.properties),
    ["latex"],
  );
  assert.deepEqual(
    Object.keys(schema.properties.reusable_board_creates.properties.item_2.properties.content.properties).sort(),
    ["items", "title"],
  );
  assert.equal(
    "reusable_item" in schema.properties.moments.items.properties.math_creates.items.properties,
    false,
  );
  assert.equal(
    "reusable_item" in schema.properties.moments.items.properties.note_creates.items.properties,
    false,
  );
});

test("every numbered request part must be taught or explicitly rejected", () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [
      { request_part: 1, treatment: "teach", sections: [1, 2] },
      { request_part: 2, treatment: "unsupported", sections: [], reason: "not available in this capability set" },
    ],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  outline.course_visuals = [{
    capability: "unit_circle_projection",
    create_section: 1,
    use_sections: [1, 2, 3],
    relation: "primary",
    reusable_item: 1,
  }];
  assert.doesNotThrow(() => validateLessonPlanOutline(outline, 2));

  const missing = structuredClone(outline);
  missing.request_coverage.pop();
  assert.throws(
    () => validateLessonPlanOutline(missing, 2),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_REQUEST_COVERAGE",
  );

  const duplicated = structuredClone(outline);
  duplicated.request_coverage[1].request_part = 1;
  assert.throws(
    () => validateLessonPlanOutline(duplicated, 2),
    (error) => error instanceof LessonPlanError && error.code === "LESSON_PLAN_REQUEST_COVERAGE",
  );
});

test("a second course visual with the same capability requires an explicit comparison", () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    course_visuals: [
      {
        capability: "unit_circle_projection",
        create_section: 1,
        use_sections: [1, 2, 3],
        relation: "primary",
        reusable_item: 1,
      },
      {
        capability: "unit_circle_projection",
        create_section: 1,
        use_sections: [1, 2, 3],
        relation: "supporting",
        related_visual: 1,
        reusable_item: 2,
      },
    ],
    sections: plan.sections.map(({ purpose, reusable_items, moments }, index) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      reusable_items: index === 0
        ? [...(reusable_items ?? []), {
          kind: "board_item",
          board_kind: "visual",
          capability: "unit_circle_projection",
        }]
        : (reusable_items ?? []),
    })),
    close: plan.close,
  };

  assert.throws(
    () => validateLessonPlanOutline(outline),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_COURSE_VISUAL"
      && error.path === "$lessonPlanOutline.course_visuals[1]",
  );
  outline.course_visuals[1].relation = "comparison";
  assert.doesNotThrow(() => validateLessonPlanOutline(outline));
});

test("learner requests are split only at stable sequencing boundaries", () => {
  assert.deepEqual(
    deriveLessonRequestParts("请结合单位圆和 y=sin x 的函数图像，解释旋转如何变成周期波动。"),
    ["请结合单位圆和 y=sin x 的函数图像，解释旋转如何变成周期波动"],
  );
  assert.deepEqual(
    deriveLessonRequestParts("请用可旋转的正方体帮我理解顶点、棱和面。再展示一个水平截面，让我从不同角度观察，最后让我转到俯视方向。"),
    [
      "请用可旋转的正方体帮我理解顶点、棱和面",
      "再展示一个水平截面，让我从不同角度观察",
      "最后让我转到俯视方向",
    ],
  );
  assert.deepEqual(
    deriveLessonRequestParts("请解释自然对数的由来和推导方式。"),
    ["请解释自然对数的由来和推导方式"],
  );
});

test("changing model prose does not change program-assigned identity", () => {
  const first = samplePlan("unit_circle_projection");
  const second = structuredClone(first);
  second.title = "A completely different title";
  second.sections[0].moments[0].narration = "Different words and no shared visual name.";
  second.sections[1].moments[0].narration = "Changed again.";

  const firstResolved = resolveLessonPlan(first);
  const secondResolved = resolveLessonPlan(second);
  assert.deepEqual(firstResolved.numbers, secondResolved.numbers);
  assert.deepEqual(firstResolved.sections, secondResolved.sections);
  assert.deepEqual(
    firstResolved.references.map((item) => item.target_id),
    secondResolved.references.map((item) => item.target_id),
  );
});

test("a later section can return to a visual without using a model-authored name", () => {
  const resolved = resolveLessonPlan(samplePlan("function_plot"));
  const oldVisualReferences = resolved.references.filter(
    (item) => item.path.includes("sections[1]")
      && item.target_id === "section-01-moment-01-item-01",
  );
  assert.ok(oldVisualReferences.length >= 3);
});

test("ordered actions preserve same-moment create, connect, then emphasize", () => {
  const plan = samplePlan("coordinate_circle");
  plan.sections[0].moments[0].actions = [
    {
      action: "create",
      kind: "visual",
      role: "circle",
      content: { capability: "coordinate_circle", numbers: [1] },
      placement: { relation: "new_region" },
      reusable_item: 1,
    },
    {
      action: "create",
      kind: "text",
      role: "explanation",
      content: { text: "radius" },
      placement: { relation: "right_of", reference: localBoardItem(1, 1) },
    },
    {
      action: "connect",
      from_ref: localBoardItem(1, 1),
      to_ref: localBoardItem(1, 2),
      relation: "explains",
    },
    {
      action: "emphasize",
      reference: { source: "local_connection", moment: 1, item: 1 },
      emphasis: "focus",
    },
  ];
  const resolved = resolveLessonPlan(plan);
  assert.equal(resolved.sections[0].moments[0].connection_ids[0], "section-01-moment-01-connection-01");

  const invalid = structuredClone(plan);
  const emphasize = invalid.sections[0].moments[0].actions.pop();
  invalid.sections[0].moments[0].actions.splice(2, 0, emphasize);
  assert.throws(
    () => resolveLessonPlan(invalid),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_REFERENCE",
  );
});

test("model-authored business identity is rejected anywhere inside visual parameters", () => {
  const plan = samplePlan("function_plot");
  plan.sections[0].moments[0].actions[0].content.parameters = {
    style: { node_id: "model-chosen-id" },
  };
  assert.throws(
    () => resolveLessonPlan(plan),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_MODEL_ID",
  );
});

test("future reusable references, unfilled slots, and unknown capability parts fail clearly", async (t) => {
  await t.test("future section", () => {
    const plan = samplePlan("function_plot");
    plan.sections[0].moments[0].actions[0].placement = {
      relation: "near",
      reference: reusable(2, 1),
    };
    assert.throws(
      () => resolveLessonPlan(plan),
      (error) => error instanceof LessonPlanError
        && error.code === "LESSON_PLAN_REFERENCE_ORDER",
    );
  });

  await t.test("unfilled slot", () => {
    const plan = samplePlan("function_plot");
    delete plan.sections[0].moments[0].actions[0].reusable_item;
    assert.throws(
      () => resolveLessonPlan(plan),
      (error) => error instanceof LessonPlanError
        && error.code === "LESSON_PLAN_REUSABLE_UNFILLED",
    );
  });

  await t.test("unknown semantic part", () => {
    const plan = samplePlan("function_plot");
    plan.sections[1].moments[0].actions[0].reference.part = {
      kind: "capability",
      role: "a_part_that_does_not_exist",
    };
    assert.throws(
      () => resolveLessonPlan(plan),
      (error) => error instanceof LessonPlanError
        && error.code === "LESSON_PLAN_PART",
    );
  });
});

test("the data contract supports more than one numeric state without names", () => {
  const plan = samplePlan("function_surface_with_section");
  plan.numbers.push({ initial: 1, min: 0, max: 4, label: "second value" });
  plan.sections[0].moments[0].actions[0].content.numbers = [1, 2];
  const resolved = resolveLessonPlan(plan);
  assert.deepEqual(resolved.numbers, [
    { index: 1, variable_id: "number_01" },
    { index: 2, variable_id: "number_02" },
  ]);
});

test("identical executable student tasks from separate sections are emitted once", () => {
  const plan = structuredClone(completeLessonPlanFixtures.square_function);
  const duplicated = structuredClone(plan.sections[2].student_activities[0]);
  plan.sections[1].student_activities = [duplicated];
  const compiled = compileAndValidateLessonPlan(plan);
  assert.equal(compiled.lesson.lesson.tasks.length, 1);
  assert.equal(compiled.lesson.lesson.tasks[0].completion.value, 2);
});

test("host-provided board references are validated separately from generated identity", () => {
  const plan = samplePlan("process_diagram");
  plan.sections[0].moments[0].actions.unshift({
    action: "point_at",
    reference: { source: "host", reference: 1 },
  });
  const resolved = resolveLessonPlan(plan, {
    host_references: [{ target_id: "existing-board-node", type: "node" }],
  });
  assert.equal(resolved.references[0].target_id, "existing-board-node");
  assert.equal(resolved.references[0].authoring_alias, "host-01");
});

test("host-provided board items remain read-only", () => {
  const plan = samplePlan("process_diagram");
  plan.sections[0].moments[0].actions.push({
    action: "revise",
    reference: { source: "host", reference: 1 },
    kind: "text",
    content: { text: "不应覆盖旧白板内容" },
    reason: "验证只读边界",
  });
  assert.throws(
    () => resolveLessonPlan(plan, { host_references: [{ target_id: "existing-board-node", type: "node" }] }),
    (error) => error?.code === "LESSON_PLAN_ACTION_TARGET" && /read-only/.test(error.message),
  );
});

test("the compiler covers all current OLL write kinds and action kinds in one deterministic matrix", () => {
  const boardItem = (item, part) => ({
    source: "local_board_item",
    moment: 1,
    item,
    ...(part ? { part: { kind: "capability", role: part } } : {}),
  });
  const plan = {
    version: "0.1",
    title: "完整 OLL 动作与板书矩阵",
    goals: ["验证数据结构完整性"],
    numbers: [
      { initial: 0, min: -2, max: 3, student_control: { kind: "slider", step: 0.5 } },
      { initial: 1, min: 0, max: 2, student_control: { kind: "slider", step: 0.5 } },
    ],
    sections: [{
      purpose: "依次创建并操作所有当前 OLL 能力",
      reusable_items: [
        { kind: "board_item", board_kind: "visual", capability: "coordinate_circle" },
        { kind: "board_item", board_kind: "visual", capability: "function_plot" },
        { kind: "connection" },
        { kind: "group" },
      ],
      moments: [{
        narration: "按顺序创建十种板书，再执行全部九类动作。",
        actions: [
          { action: "create", kind: "text", role: "definition", content: { text: "普通文字" }, placement: { relation: "new_region" } },
          { action: "create", kind: "math", role: "derivation", content: { latex: "a^2+b^2=c^2" }, placement: { relation: "below", reference: boardItem(1) } },
          { action: "create", kind: "shape", role: "diagram", content: { text: "方向箭头" }, placement: { relation: "right_of", reference: boardItem(1) } },
          { action: "create", kind: "note", role: "conclusion", content: { title: "结论", items: ["第一项", "第二项"] }, placement: { relation: "below", reference: boardItem(2) } },
          { action: "create", kind: "table", role: "example", content: { columns: ["x", "y"], rows: [[0, 0], [1, 1]] }, placement: { relation: "right_of", reference: boardItem(4) } },
          { action: "create", kind: "image", role: "example", content: { resource: 1, alt: "受控测试图片" }, placement: { relation: "below", reference: boardItem(4) } },
          { action: "create", kind: "visual", role: "diagram", content: { capability: "process_diagram", parameters: { steps: ["观察", "计算", "验证"] } }, placement: { relation: "right_of", reference: boardItem(6) } },
          { action: "create", kind: "visual", role: "diagram", content: { capability: "coordinate_circle", parameters: { radius: 2 } }, placement: { relation: "below", reference: boardItem(6) }, reusable_item: 1 },
          { action: "create", kind: "visual", role: "diagram", content: { capability: "function_plot", parameters: { expression: "x^2" }, numbers: [1] }, placement: { relation: "right_of", reference: boardItem(8) }, reusable_item: 2 },
          { action: "create", kind: "visual", role: "diagram", content: { capability: "cube_with_section", parameters: {}, numbers: [2] }, placement: { relation: "below", reference: boardItem(8) } },
          { action: "revise", reference: boardItem(1), kind: "text", content: { text: "修订后的普通文字" }, reason: "补充说明" },
          { action: "connect", from_ref: boardItem(8, "circle"), to_ref: boardItem(9, "primary_curve"), relation: "compares_with", label: "图形比较", reusable_item: 3 },
          { action: "group", role: "comparison", label: "二维图形组", members: [boardItem(8), boardItem(9)], reusable_item: 4 },
          { action: "emphasize", reference: { source: "local_connection", moment: 1, item: 1 }, emphasis: "focus" },
          { action: "point_at", reference: { source: "host", reference: 1, part: { kind: "index", index: 1 } } },
          { action: "teacher_expression", expression: "encouraging" },
          { action: "animate", number: 1, end_value: 2, easing: "linear", duration_intent: "brief" },
          { action: "focus", references: [{ source: "local_group", moment: 1, item: 1 }, boardItem(10)], intent: "展示动作矩阵", timing: "after_speech" },
        ],
      }],
      student_activities: [{
        kind: "number_target",
        prompt: "调整两个数，使它们的和等于 2.5。",
        number_controls: [
          { number: 1, controls: ["slider"] },
          { number: 2, controls: ["slider"] },
        ],
        expression: [
          { kind: "number", number: 1 },
          { kind: "number", number: 2 },
          { kind: "operator", operator: "add" },
        ],
        value: 2.5,
        tolerance: 0.01,
        hints: ["两个滑杆都可以调整。"],
      }],
    }],
    close: {
      summary: "完成所有当前板书和动作的验证。",
      focus: [
        { source: "reusable", section: 1, item: 4 },
        { source: "host", reference: 1 },
      ],
    },
  };
  const compiled = compileAndValidateLessonPlan(plan, {
    image_resources: [{ asset_id: "asset-matrix-01" }],
    host_references: [{
      target_id: "existing-node-id",
      type: "node",
      parts: ["existing-fragment-id"],
    }],
    board_context: { board_id: "existing-board", revision: 3 },
  });
  const actions = compiled.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions);
  assert.deepEqual(
    new Set(actions.filter((action) => action.do === "write").map((action) => action.kind)),
    new Set(["text", "math", "shape", "note", "table", "image", "diagram", "geometry", "plot", "scene3d"]),
  );
  assert.deepEqual(
    new Set(actions.map((action) => action.do)),
    new Set(["write", "revise", "emphasize", "connect", "group", "focus", "point", "expression", "animate"]),
  );
  assert.equal(compiled.lesson.lesson.tasks[0].completion.expression, "(number_01)+(number_02)");
  assert.deepEqual(compiled.lesson.close.focus, [
    "section-01-moment-01-group-01",
    "host-01",
  ]);
});

test("the staged model path keeps default concurrency at one and repairs only the invalid section", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: "0.1",
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  Object.assign(outline, modelCourseVisualStructure(plan, drafts));
  // The model-facing contract can identify a reusable item from the current
  // section after creating it. The program must lower that positional
  // reference to the actual local item instead of treating it as a future
  // reference.
  drafts[0].moments[0].focuses[0].references = [{
    source: "reusable",
    section: 1,
    moment: 0,
    item: 1,
    host_reference: 0,
  }];
  drafts[0].course_visual_creates.visual_1.content.numbers = [];
  drafts[0].moments.push({
    narration: "继续观察刚才的画面。",
    delivery: "patient",
    ...Object.fromEntries(modelActionCollectionNames.map((name) => [name, []])),
  });
  // Presentation hints are allowed to be imprecise without making the course
  // structurally invalid. An impossible local item and capability part must
  // fall back to the latest valid visual, with the invalid part removed.
  drafts[1].moments[0].points[0].reference = {
    source: "local_board_item",
    section: 0,
    moment: 0,
    item: 999,
    host_reference: 0,
    part: { kind: "capability", role: "not-a-real-part", index: 0 },
  };
  // A probabilistic model may accidentally choose the current value as the
  // target. That is a mechanically meaningless task, so lowering must select
  // a reachable alternative without another model request.
  drafts[2].number_activities[0].value_mantissa = 0;
  drafts[2].number_activities[0].value_scale = 0;
  const calls = [];
  let active = 0;
  let peakActive = 0;
  let sectionTwoCalls = 0;
  const playablePrefixes = [];
  const rejectedParts = [];
  const modelOutline = structuredClone(outline);
  modelOutline.request_coverage = [
    { request_part: 1, treatment: "teach", sections: [1, 2, 3] },
    { request_part: 2, treatment: "teach", sections: [2] },
    { request_part: 3, treatment: "teach", sections: [3] },
  ];
  modelOutline.numbers = modelOutline.numbers.map((number) => ({
    ...number,
    initial: String(number.initial),
    min: String(number.min),
    max: String(number.max),
    ...(number.student_control ? {
      student_control: { ...number.student_control, step: String(number.student_control.step) },
    } : {}),
  }));
  modelOutline.request_coverage[0].reason = "";
  modelOutline.numbers[0].unit = "";
  // Simulate an old or out-of-contract model response with an unusably fine
  // step. The program must replace this mechanical value without asking the
  // model to repair any section.
  modelOutline.numbers[0].student_control.step = "0.000000001";
  modelOutline.close.focus = [{ source: "reusable", section: 99, item: 99 }];
  const model = async (request) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    calls.push(request);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
    active -= 1;
    if (request.label === "lesson-plan-outline") return JSON.stringify(modelOutline);
    const section = JSON.parse(request.prompt).section_to_write;
    if (section === 2) {
      sectionTwoCalls += 1;
      if (sectionTwoCalls === 1) {
        const invalid = structuredClone(drafts[1]);
        invalid.section = 99;
        return JSON.stringify(invalid);
      }
    }
    return JSON.stringify(drafts[section - 1]);
  };
  const generated = await generateLessonPlanWithModel(model, {
    turn_id: "turn-lesson-plan-staged",
    learner_request: "请结合单位圆和正弦函数图像解释旋转如何变成周期波动。再说明关键角度，最后让我拖动到最高点。",
  }, {
    on_rejected_part: (event) => rejectedParts.push(event),
    on_playable_prefix: ({ completed_sections, compiled }) => {
      playablePrefixes.push({ completed_sections, step_count: compiled.lesson.steps.length });
    },
  });
  assert.equal(peakActive, 1);
  assert.equal(generated.model_calls, 5);
  assert.equal(sectionTwoCalls, 2);
  assert.deepEqual(calls.map((call) => call.label), [
    "lesson-plan-outline",
    "lesson-plan-section",
    "lesson-plan-section",
    "lesson-plan-section",
    "lesson-plan-section",
  ]);
  const repairedSectionCall = calls.filter((call) => call.label === "lesson-plan-section"
    && JSON.parse(call.prompt).section_to_write === 2).at(-1);
  assert.match(repairedSectionCall.prompt, /previous_validation_error/u);
  assert.equal(generated.lesson.steps.length, 3);
  assert.equal(typeof generated.outline.numbers[0].initial, "number");
  assert.ok(
    (generated.outline.numbers[0].max - generated.outline.numbers[0].min)
      / generated.outline.numbers[0].student_control.step <= 1_000,
  );
  assert.notEqual(generated.outline.numbers[0].student_control.step, 0.000000001);
  assert.equal("unit" in generated.outline.numbers[0], false);
  assert.equal("reason" in generated.outline.request_coverage[0], false);
  const outlineRequestParts = JSON.parse(calls[0].prompt).request_parts;
  assert.deepEqual(outlineRequestParts, [
    { request_part: 1, text: "请结合单位圆和正弦函数图像解释旋转如何变成周期波动" },
    { request_part: 2, text: "再说明关键角度" },
    { request_part: 3, text: "最后让我拖动到最高点" },
  ]);
  const sectionTwoPrompt = JSON.parse(calls.find((call) => call.label === "lesson-plan-section"
    && JSON.parse(call.prompt).section_to_write === 2).prompt);
  assert.deepEqual(sectionTwoPrompt.assigned_request_parts, [
    outlineRequestParts[0],
    outlineRequestParts[1],
  ]);
  assert.ok(generated.outline.close.focus.length > 0);
  for (const reference of generated.outline.close.focus) {
    assert.equal(reference.source, "reusable");
    assert.ok(reference.section <= generated.outline.sections.length);
    assert.ok(reference.item <= generated.outline.sections[reference.section - 1].reusable_items.length);
  }
  assert.deepEqual(playablePrefixes, [
    { completed_sections: 1, step_count: 1 },
    { completed_sections: 2, step_count: 2 },
    { completed_sections: 3, step_count: 3 },
  ]);
  assert.equal(rejectedParts.length, 1);
  assert.equal(rejectedParts[0].label, "lesson-plan-section");
  assert.equal(rejectedParts[0].section, 2);
  assert.equal(rejectedParts[0].attempt, 1);
  assert.equal(rejectedParts[0].error.code, "LESSON_PLAN_SECTION_DRAFTS");
  assert.deepEqual(generated.drafts[0].moments[0].actions.find((action) => action.action === "focus").references, [
    { source: "local_board_item", moment: 1, item: 1 },
  ]);
  assert.deepEqual(generated.drafts[0].moments[0].actions.find((action) => (
    action.action === "create" && action.kind === "visual"
  )).content.numbers, [1]);
  assert.deepEqual(generated.drafts[0].moments[1].actions, [{
    action: "focus",
    references: [{ source: "local_board_item", moment: 1, item: 1 }],
    intent: "继续观察当前画面",
    timing: "after_speech",
  }]);
  assert.deepEqual(generated.drafts[1].moments[0].actions.find((action) => action.action === "point_at").reference, {
    source: "reusable",
    section: 1,
    item: 1,
  });
  assert.ok(
    Math.abs(
      generated.drafts[2].student_activities[0].value
        - generated.outline.numbers[0].max,
    ) < 1e-10,
  );
  assert.ok(generated.drafts[2].student_activities[0].tolerance > 0);
  assert.notEqual(
    generated.drafts[2].student_activities[0].value,
    generated.outline.numbers[0].initial,
  );
  assert.match(generated.drafts[2].student_activities[0].prompt, /6\.28/u);
});

test("later sections generate concurrently, publish in order, and fall back after a provider rate limit", async (t) => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const buildModelParts = () => {
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
      version: "0.1",
      section: index + 1,
      moments,
      ...(student_activities ? { student_activities } : {}),
    }));
    const outline = {
      version: plan.version,
      title: plan.title,
      goals: plan.goals,
      numbers: plan.numbers.map((number) => ({
        ...number,
        initial: String(number.initial),
        min: String(number.min),
        max: String(number.max),
        ...(number.student_control ? {
          student_control: { ...number.student_control, step: String(number.student_control.step) },
        } : {}),
      })),
      request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
      sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
        purpose,
        allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
          .filter((action) => action.action === "create" && action.kind === "visual")
          .map((action) => action.content.capability))],
        ...(reusable_items ? { reusable_items } : {}),
      })),
      close: { summary: plan.close.summary },
    };
    Object.assign(outline, modelCourseVisualStructure(plan, drafts));
    return { outline, drafts };
  };

  await t.test("a faster later section waits for the previous section before publication", async () => {
    const { outline, drafts } = buildModelParts();
    const completed = [];
    const published = [];
    let active = 0;
    let peakActive = 0;
    await generateLessonPlanWithModel(async (request) => {
      if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
      active += 1;
      peakActive = Math.max(peakActive, active);
      const delay = request.section === 2 ? 25 : request.section === 3 ? 2 : 0;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      active -= 1;
      completed.push(request.section);
      return JSON.stringify(drafts[request.section - 1]);
    }, {
      turn_id: "turn-concurrent-sections",
      learner_request: "请结合单位圆和正弦函数图像解释旋转如何变成周期波动。",
      request_parts: ["请结合单位圆和正弦函数图像解释旋转如何变成周期波动。"],
    }, {
      max_concurrency: 2,
      on_playable_prefix: ({ completed_sections }) => published.push(completed_sections),
    });
    assert.equal(peakActive, 2);
    assert.deepEqual(completed, [1, 3, 2]);
    assert.deepEqual(published, [1, 2, 3]);
  });

  await t.test("a 429 switches remaining work to one request without regenerating completed sections", async () => {
    const { outline, drafts } = buildModelParts();
    const calls = new Map();
    const published = [];
    const fallbacks = [];
    await generateLessonPlanWithModel(async (request) => {
      if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
      calls.set(request.section, (calls.get(request.section) ?? 0) + 1);
      if (request.section === 2 && calls.get(2) === 1) {
        throw new Error("HTTP 429 RESOURCE_EXHAUSTED");
      }
      if (request.section === 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      return JSON.stringify(drafts[request.section - 1]);
    }, {
      turn_id: "turn-concurrency-fallback",
      learner_request: "请结合单位圆和正弦函数图像解释旋转如何变成周期波动。",
      request_parts: ["请结合单位圆和正弦函数图像解释旋转如何变成周期波动。"],
    }, {
      max_concurrency: 2,
      on_playable_prefix: ({ completed_sections }) => published.push(completed_sections),
      on_concurrency_fallback: (event) => fallbacks.push(event),
    });
    assert.deepEqual(fallbacks, [{ section: 2, reason: "rate_limited" }]);
    assert.deepEqual(published, [1, 2, 3]);
    assert.equal(calls.get(1), 1);
    assert.equal(calls.get(2), 2);
    assert.equal(calls.get(3), 1);
  });
});

test("a progressive prefix does not expose a control before its visual section exists", async () => {
  const plan = {
    version: "0.1",
    title: "用几何重排理解勾股定理",
    goals: ["通过刚体重排理解面积关系"],
    numbers: [{
      initial: 0,
      min: 0,
      max: 1,
      label: "重排进度",
      student_control: { kind: "slider", step: 0.01 },
    }],
    sections: [
      {
        purpose: "先写出要证明的面积关系",
        reusable_items: [{ kind: "board_item", board_kind: "math" }],
        moments: [{
          narration: "先看我们要证明的面积关系。",
          actions: [
            {
              action: "create",
              kind: "math",
              role: "goal",
              content: { latex: "a^2+b^2=c^2" },
              placement: { relation: "new_region" },
              reusable_item: 1,
            },
            {
              action: "focus",
              references: [localBoardItem(1, 1)],
              intent: "看清待证关系",
              timing: "after_speech",
            },
          ],
        }],
      },
      {
        purpose: "移动四个全等直角三角形",
        reusable_items: [{
          kind: "board_item",
          board_kind: "visual",
          capability: "geometric_rearrangement",
        }],
        moments: [{
          narration: "拖动进度，观察四个全等三角形只平移和旋转。",
          actions: [
            {
              action: "create",
              kind: "visual",
              role: "rearrangement",
              content: {
                capability: "geometric_rearrangement",
                parameters: { construction: "right_triangle_square", leg_a: 3, leg_b: 2 },
                numbers: [1],
              },
              placement: { relation: "new_region" },
              reusable_item: 1,
            },
            {
              action: "focus",
              references: [localBoardItem(1, 1)],
              intent: "观察几何重排",
              timing: "after_speech",
            },
          ],
        }],
      },
      {
        purpose: "回到重排画面总结",
        moments: [{
          narration: "图形没有变形，变化的只是排列方式。",
          actions: [{
            action: "focus",
            references: [reusable(2, 1)],
            intent: "总结重排结果",
            timing: "after_speech",
          }],
        }],
      },
    ],
    close: { summary: "刚体重排保持每块面积不变。", focus: [reusable(2, 1)] },
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const visualStructure = modelCourseVisualStructure(plan, drafts);
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers.map((number) => ({
      ...number,
      initial: String(number.initial),
      min: String(number.min),
      max: String(number.max),
      student_control: { ...number.student_control, step: String(number.student_control.step) },
    })),
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    ...visualStructure,
    close: { summary: plan.close.summary },
  };
  const prefixes = [];
  const rejected = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-future-control",
    learner_request: "请用四个全等直角三角形的重排解释勾股定理。",
  }, {
    on_playable_prefix: ({ completed_sections, compiled }) => {
      prefixes.push({
        completed_sections,
        has_control: Boolean(compiled.lesson.lesson.variables?.[0]?.control),
      });
    },
    on_rejected_part: (event) => rejected.push(event),
  });

  assert.deepEqual(prefixes, [
    { completed_sections: 1, has_control: false },
    { completed_sections: 2, has_control: true },
    { completed_sections: 3, has_control: true },
  ]);
  assert.deepEqual(rejected, []);
  assert.ok(generated.lesson.lesson.variables[0].control);
  const geometry = generated.lesson.steps[1].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "geometry",
  );
  assert.ok(geometry.content.bindings.some((binding) => binding.expression.includes("number_01")));
});

test("the live bootstrap path returns the outline and first playable section in one model call", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  Object.assign(outline, modelCourseVisualStructure(plan, drafts, { canonical: false }));
  const calls = [];
  const prefixes = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push(request);
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({ outline, first_section: drafts[0] });
    }
    const section = JSON.parse(request.prompt).section_to_write;
    return JSON.stringify(drafts[section - 1]);
  }, {
    turn_id: "turn-bootstrap-course",
    learner_request: "请结合单位圆和正弦图解释旋转如何变成周期波动。",
    request_parts: ["请结合单位圆和正弦图解释旋转如何变成周期波动。"],
  }, {
    bootstrap_first_section: true,
    on_playable_prefix: ({ completed_sections }) => prefixes.push(completed_sections),
  });

  assert.deepEqual(calls.map((call) => call.label), [
    "lesson-plan-bootstrap",
    "lesson-plan-section",
    "lesson-plan-section",
  ]);
  assert.equal(generated.model_calls, 3);
  assert.deepEqual(prefixes, [1, 2, 3]);
  assert.equal(generated.lesson.steps.length, 3);
  assert.equal(calls[0].part, "bootstrap");
  assert.ok(calls[0].response_schema.properties.outline);
  assert.ok(calls[0].response_schema.properties.first_section);
});

test("a spoken fragment can request clarification without compiling a guessed lesson", async () => {
  const requests = [];
  const prefixes = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    requests.push(request);
    return JSON.stringify({
      disposition: "clarify",
      learner_response: "你想了解这本书的哪一方面？",
    });
  }, {
    turn_id: "turn-voice-fragment",
    learner_request: "The book.",
    input_modality: "voice",
  }, {
    bootstrap_first_section: true,
    on_playable_prefix: (event) => prefixes.push(event),
  });

  assert.deepEqual(generated, {
    disposition: "clarify",
    learner_response: "你想了解这本书的哪一方面？",
    model_calls: 1,
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].system_prompt, /不要从可用画面或数学能力猜测/u);
  assert.deepEqual(
    requests[0].response_schema.properties.disposition.enum,
    ["generate_lesson", "clarify", "ignore"],
  );
  assert.deepEqual(
    requests[0].response_schema.required,
    ["disposition", "learner_response"],
  );
  assert.deepEqual(prefixes, []);
});

test("a failed admission bootstrap keeps clarification semantics in the small-outline fallback", async () => {
  const requests = [];
  const timeout = Object.assign(new Error("bootstrap timed out"), { code: "VERTEX_REQUEST_TIMEOUT" });
  const generated = await generateLessonPlanWithModel(async (request) => {
    requests.push(request);
    if (request.label === "lesson-plan-bootstrap") throw timeout;
    return JSON.stringify({
      disposition: "clarify",
      learner_response: "你想学习这本书的哪一部分？",
    });
  }, {
    turn_id: "turn-voice-fragment-after-bootstrap-timeout",
    learner_request: "The book.",
    input_modality: "voice",
  }, {
    bootstrap_first_section: true,
  });

  assert.deepEqual(generated, {
    disposition: "clarify",
    learner_response: "你想学习这本书的哪一部分？",
    model_calls: 2,
  });
  assert.deepEqual(requests.map((request) => request.label), [
    "lesson-plan-bootstrap",
    "lesson-plan-outline",
  ]);
  assert.ok(requests[1].response_schema.properties.outline);
  assert.equal(requests[1].response_schema.properties.first_section, undefined);
  assert.match(requests[1].system_prompt, /不要从可用画面或数学能力猜测/u);

  const emptyResponse = Object.assign(new Error("empty provider candidate"), {
    code: "VERTEX_RESPONSE_EMPTY",
  });
  const emptyCalls = [];
  const recoveredFromEmpty = await generateLessonPlanWithModel(async (request) => {
    emptyCalls.push(request.label);
    if (request.label === "lesson-plan-bootstrap") throw emptyResponse;
    return JSON.stringify({
      disposition: "clarify",
      learner_response: "你想学习这本书的哪一部分？",
    });
  }, {
    turn_id: "turn-voice-fragment-after-empty-candidate",
    learner_request: "The book.",
    input_modality: "voice",
  }, {
    bootstrap_first_section: true,
  });
  assert.equal(recoveredFromEmpty.disposition, "clarify");
  assert.deepEqual(emptyCalls, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
});

test("the first playable deadline is shared by bootstrap and fallback requests", async () => {
  const calls = [];
  const timedOut = Object.assign(new Error("bootstrap timed out"), { code: "VERTEX_REQUEST_TIMEOUT" });
  await assert.rejects(
    () => generateLessonPlanWithModel(async (request) => {
      calls.push(request);
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw timedOut;
    }, {
      turn_id: "turn-first-playable-deadline",
      learner_request: "解释单位圆和正弦函数。",
      request_parts: ["解释单位圆和正弦函数。"],
    }, {
      bootstrap_first_section: true,
      first_playable_timeout_ms: 5,
    }),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_FIRST_PLAYABLE_TIMEOUT",
  );
  assert.equal(calls.length, 1, "the fallback must not start after the total first-playable budget expires");
  assert.ok(calls[0].timeout_ms <= 5);
});

test("a clear spoken learning request still compiles the ordinary complete lesson", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  Object.assign(outline, modelCourseVisualStructure(plan, drafts, { canonical: false }));

  const generated = await generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({
        disposition: "generate_lesson",
        learner_response: "",
        outline,
        first_section: drafts[0],
      });
    }
    const section = JSON.parse(request.prompt).section_to_write;
    return JSON.stringify(drafts[section - 1]);
  }, {
    turn_id: "turn-clear-voice-course",
    learner_request: "请结合单位圆和正弦图解释周期波动。",
    request_parts: ["请结合单位圆和正弦图解释周期波动。"],
    input_modality: "voice",
  }, {
    bootstrap_first_section: true,
  });

  assert.equal("lesson" in generated, true);
  assert.equal(generated.lesson.steps.length, 3);
});

test("the lesson admission schema does not force course fields for clarification", () => {
  const schema = buildLessonPlanAdmissionBootstrapJsonSchema(1);
  const fallbackSchema = buildLessonPlanAdmissionOutlineJsonSchema(1);
  assert.deepEqual(schema.required, ["disposition", "learner_response"]);
  assert.ok(schema.properties.outline);
  assert.ok(schema.properties.first_section);
  assert.deepEqual(fallbackSchema.required, ["disposition", "learner_response"]);
  assert.ok(fallbackSchema.properties.outline);
  assert.equal(fallbackSchema.properties.first_section, undefined);
});

test("the bootstrap path ignores model-authored viewport parameters and computes its own", async () => {
  const plan = completeLessonPlanFixtures.square_function;
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  Object.assign(outline, modelCourseVisualStructure(plan, drafts, { canonical: false }));
  const parameters = drafts[0].moments[0].visual_creates[0].content.parameters;
  parameters.formulas = [parameters.expression];
  delete parameters.expression;
  const decimal = (value) => ({ mantissa: value * 10, scale: 1 });
  parameters.x_min = decimal(-4);
  parameters.x_max = decimal(4);
  parameters.y_min = decimal(-1);
  parameters.y_max = decimal(10);
  drafts[0].moments[0].visual_creates[0].course_visual = 32;
  drafts[0].moments[0].visual_creates[0].reusable_item = 32;

  const bootstrapSchema = buildLessonPlanBootstrapJsonSchema(1);
  const bootstrapMoment = bootstrapSchema.properties.first_section.properties.moments.items.properties;
  assert.equal(
    "course_visual" in bootstrapMoment.visual_creates.items.properties,
    false,
  );
  assert.equal("reusable_item" in bootstrapMoment.visual_creates.items.properties, false);
  assert.equal("reusable_item" in bootstrapMoment.math_creates.items.properties, false);
  assert.equal("reusable_item" in bootstrapMoment.note_creates.items.properties, false);
  for (const field of ["x_min", "x_max", "y_min", "y_max", "samples"]) {
    assert.equal(field in bootstrapMoment.visual_creates.items.properties.content.properties.parameters.properties, false);
  }

  const calls = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push(request);
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({ outline, first_section: drafts[0] });
    }
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-bootstrap-decimal-parameters",
    learner_request: "请结合函数图像解释 y=x^2 为什么开口向上。",
    request_parts: ["请结合函数图像解释 y=x^2 为什么开口向上。"],
  }, {
    bootstrap_first_section: true,
  });

  assert.deepEqual(calls.map(({ label, section }) => ({ label, section })), [
    { label: "lesson-plan-bootstrap", section: undefined },
    { label: "lesson-plan-section", section: 2 },
    { label: "lesson-plan-section", section: 3 },
  ]);
  assert.equal(generated.model_calls, 3);
  const plot = generated.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  ).content;
  assert.deepEqual(plot.axes.x, {
    min: plan.numbers[0].min,
    max: plan.numbers[0].max,
    label: "x",
  });
  assert.ok(plot.axes.y.min < 0);
  assert.ok(plot.axes.y.max > 9);
});

test("the bootstrap path drops reusable board declarations that the same response did not create", async () => {
  const plan = completeLessonPlanFixtures.square_function;
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: [],
    close: { summary: plan.close.summary },
  };
  Object.assign(outline, modelCourseVisualStructure(plan, drafts, { canonical: false }));
  outline.sections[0].reusable_items.unshift({ kind: "board_item", board_kind: "note" });
  const extraVisual = structuredClone(drafts[0].moments[0].visual_creates[0]);
  extraVisual.role = "duplicate_view_not_declared_by_outline";
  drafts[0].moments[0].visual_creates.push(extraVisual);

  const calls = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push({ label: request.label, section: request.section });
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({ outline, first_section: drafts[0] });
    }
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-bootstrap-prune-unfilled-reusable",
    learner_request: "请结合函数图像解释 y=x^2 为什么开口向上。",
    request_parts: ["请结合函数图像解释 y=x^2 为什么开口向上。"],
  }, {
    bootstrap_first_section: true,
    max_attempts_per_part: 1,
  });

  assert.deepEqual(calls, [
    { label: "lesson-plan-bootstrap", section: undefined },
    { label: "lesson-plan-section", section: 2 },
    { label: "lesson-plan-section", section: 3 },
  ]);
  assert.equal(generated.model_calls, 3);
  assert.deepEqual(generated.outline.sections[0].reusable_items, [
    { kind: "board_item", board_kind: "visual", capability: "function_plot" },
  ]);
  assert.equal(generated.outline.course_visuals[0].reusable_item, 1);
  assert.equal(
    generated.lesson.steps[0].beats[0].actions.filter(
      (action) => action.do === "write" && action.kind === "plot",
    ).length,
    1,
  );
});

test("an invalid speculative first section does not consume the formal section attempt", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const exactDrafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const invalidBootstrapFirstSection = structuredClone(exactDrafts[0]);
  invalidBootstrapFirstSection.moments[0].visual_creates = [];
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  Object.assign(outline, modelCourseVisualStructure(plan, exactDrafts));
  const calls = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push({ label: request.label, section: request.section, attempt: request.attempt });
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({ outline, first_section: invalidBootstrapFirstSection });
    }
    return JSON.stringify(exactDrafts[request.section - 1]);
  }, {
    turn_id: "turn-bootstrap-fallback",
    learner_request: "请结合单位圆和正弦图解释旋转如何变成周期波动。",
    request_parts: ["请结合单位圆和正弦图解释旋转如何变成周期波动。"],
  }, {
    bootstrap_first_section: true,
    max_attempts_per_part: 1,
  });

  assert.deepEqual(calls, [
    { label: "lesson-plan-bootstrap", section: undefined, attempt: 1 },
    { label: "lesson-plan-section", section: 1, attempt: 1 },
    { label: "lesson-plan-section", section: 2, attempt: 1 },
    { label: "lesson-plan-section", section: 3, attempt: 1 },
  ]);
  assert.equal(generated.lesson.steps.length, 3);
});

test("truncated combined output falls back to the small outline and exact section contracts", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  // After the combined request fails, every section is requested through the
  // exact section contract. Keep the fixture in that contract as well instead
  // of returning the permissive bootstrap shape to an exact section request.
  Object.assign(outline, modelCourseVisualStructure(plan, drafts));
  const calls = [];
  const rejected = [];
  let sectionTwoCalls = 0;
  const truncated = () => Object.assign(
    new Error("Vertex response was truncated at maxOutputTokens"),
    { code: "VERTEX_RESPONSE_TRUNCATED" },
  );

  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push({
      label: request.label,
      section: request.section,
      attempt: request.attempt,
      max_output_tokens: request.max_output_tokens,
      timeout_ms: request.timeout_ms,
    });
    if (request.label === "lesson-plan-bootstrap") {
      throw truncated();
    }
    if (request.label === "lesson-plan-outline") {
      assert.match(request.prompt, /previous_validation_error/u);
      return JSON.stringify(outline);
    }
    if (request.section === 2) {
      sectionTwoCalls += 1;
      if (sectionTwoCalls === 1) throw truncated();
      assert.match(request.prompt, /previous_validation_error/u);
    }
    assert.deepEqual(
      Object.keys(drafts[request.section - 1].course_visual_creates ?? {}).sort(),
      (request.response_schema.properties.course_visual_creates?.required ?? []).sort(),
      `section ${request.section} fixture must match the exact fallback contract`,
    );
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-truncated-output-retry",
    learner_request: "请结合单位圆和正弦图解释旋转如何变成周期波动。",
    request_parts: ["请结合单位圆和正弦图解释旋转如何变成周期波动。"],
  }, {
    bootstrap_first_section: true,
    on_rejected_part: (event) => rejected.push(event),
  });

  assert.deepEqual(calls, [
    { label: "lesson-plan-bootstrap", section: undefined, attempt: 1, max_output_tokens: 4096, timeout_ms: 30000 },
    { label: "lesson-plan-outline", section: undefined, attempt: 2, max_output_tokens: 4096, timeout_ms: 30000 },
    { label: "lesson-plan-section", section: 1, attempt: 1, max_output_tokens: 4096, timeout_ms: 30000 },
    { label: "lesson-plan-section", section: 2, attempt: 1, max_output_tokens: 4096, timeout_ms: 30000 },
    { label: "lesson-plan-section", section: 2, attempt: 2, max_output_tokens: 4096, timeout_ms: 30000 },
    { label: "lesson-plan-section", section: 3, attempt: 1, max_output_tokens: 4096, timeout_ms: 30000 },
  ]);
  assert.equal(generated.model_calls, 6);
  assert.equal(generated.lesson.steps.length, 3);
  assert.deepEqual(
    rejected.map(({ label, section, attempt }) => ({ label, section, attempt })),
    [
      { label: "lesson-plan-outline", section: undefined, attempt: 1 },
      { label: "lesson-plan-section", section: 2, attempt: 1 },
    ],
  );

  const timeoutCalls = [];
  const timedOut = Object.assign(
    new Error("Vertex lesson-plan-bootstrap exceeded its request timeout"),
    { code: "VERTEX_REQUEST_TIMEOUT" },
  );
  const recoveredAfterTimeout = await generateLessonPlanWithModel(async (request) => {
    timeoutCalls.push(request.label);
    if (request.label === "lesson-plan-bootstrap") throw timedOut;
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-timeout-output-fallback",
    learner_request: "请结合单位圆和正弦图解释旋转如何变成周期波动。",
    request_parts: ["请结合单位圆和正弦图解释旋转如何变成周期波动。"],
  }, {
    bootstrap_first_section: true,
  });
  assert.deepEqual(timeoutCalls, [
    "lesson-plan-bootstrap",
    "lesson-plan-outline",
    "lesson-plan-section",
    "lesson-plan-section",
    "lesson-plan-section",
  ]);
  assert.equal(recoveredAfterTimeout.lesson.steps.length, 3);

  const invalidOutlineCalls = [];
  const recoveredAfterInvalidOutline = await generateLessonPlanWithModel(async (request) => {
    invalidOutlineCalls.push(request.label);
    if (request.label === "lesson-plan-bootstrap") {
      return JSON.stringify({
        outline: { ...outline, sections: [] },
        first_section: drafts[0],
      });
    }
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-invalid-outline-fallback",
    learner_request: "请结合单位圆和正弦图解释旋转如何变成周期波动。",
    request_parts: ["请结合单位圆和正弦图解释旋转如何变成周期波动。"],
  }, {
    bootstrap_first_section: true,
  });
  assert.deepEqual(invalidOutlineCalls, [
    "lesson-plan-bootstrap",
    "lesson-plan-outline",
    "lesson-plan-section",
    "lesson-plan-section",
    "lesson-plan-section",
  ]);
  assert.equal(recoveredAfterInvalidOutline.lesson.steps.length, 3);
});

test("the staged model path lowers positional curve tokens into a multi-number plot", async () => {
  const plan = completeLessonPlanFixtures.quadratic_translation;
  const decimal = (value) => ({ mantissa: Math.round(value * 10 ** 6), scale: 6 });
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers.map((number) => ({
      ...number,
      initial: decimal(number.initial),
      min: decimal(number.min),
      max: decimal(number.max),
      student_control: {
        ...number.student_control,
        step: decimal(number.student_control.step),
      },
    })),
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: { summary: plan.close.summary },
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  Object.assign(outline, modelCourseVisualStructure(plan, drafts));
  const calls = [];
  const rejectedParts = [];
  let firstSectionCalls = 0;
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push(request);
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    const section = JSON.parse(request.prompt).section_to_write;
    if (section === 1) {
      firstSectionCalls += 1;
      if (firstSectionCalls === 1) {
        const invalid = structuredClone(drafts[0]);
        const visual = invalid.course_visual_creates.visual_1.content;
        delete visual.parameters.formulas;
        visual.parameters.expression = "x^2";
        visual.numbers = [1, 2];
        return JSON.stringify(invalid);
      }
    }
    return JSON.stringify(drafts[section - 1]);
  }, {
    turn_id: "turn-dynamic-quadratic",
    learner_request: "用 h 和 k 移动整条抛物线。",
    request_parts: ["用 h 和 k 移动整条抛物线。"],
  }, {
    on_rejected_part: (event) => rejectedParts.push(event),
  });

  assert.equal(generated.model_calls, 5);
  assert.equal(firstSectionCalls, 2);
  assert.deepEqual(
    calls.map(({ part, section, attempt }) => ({ part, section, attempt })),
    [
      { part: "outline", section: undefined, attempt: 1 },
      { part: "section", section: 1, attempt: 1 },
      { part: "section", section: 1, attempt: 2 },
      { part: "section", section: 2, attempt: 1 },
      { part: "section", section: 3, attempt: 1 },
    ],
  );
  assert.equal(rejectedParts.length, 1);
  assert.equal(rejectedParts[0].section, 1);
  assert.equal(rejectedParts[0].error.code, "LESSON_PLAN_CAPABILITY_PARAMETER");
  assert.match(rejectedParts[0].error.message, /at most one number as its moving sample/u);
  const repairedCall = calls.filter((call) => call.label === "lesson-plan-section"
    && JSON.parse(call.prompt).section_to_write === 1).at(-1);
  assert.match(repairedCall.prompt, /previous_validation_error/u);
  assert.match(repairedCall.prompt, /at most one number as its moving sample/u);
  const plot = generated.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.match(plot.content.curves[0].expression, /number_01/u);
  assert.match(plot.content.curves[0].expression, /number_02/u);
  assert.equal(plot.content.points, undefined);
  const firstSectionSchema = calls.find((call) => call.label === "lesson-plan-section").response_schema;
  const visualContentSchema = firstSectionSchema.properties.course_visual_creates.properties.visual_1
    .properties.content;
  const parameterSchema = visualContentSchema.properties.parameters;
  const parameters = parameterSchema.properties;
  assert.ok(visualContentSchema.required.includes("parameters"));
  assert.ok(parameterSchema.required.includes("formulas"));
  assert.ok(parameters.formulas);
  assert.equal(parameters.formulas.type, "array");
  assert.equal(parameters.formulas.items.type, "string");
  assert.equal(parameters.formula, undefined);
  assert.equal(parameters.expression, undefined);
  assert.equal(parameters.expressions, undefined);
  assert.equal(parameters.expression_tokens, undefined);
  assert.equal(parameters.number_effect, undefined);
});

test("the staged model path lowers several static formulas into one multi-curve plot", async () => {
  const plan = completeLessonPlanFixtures.square_function;
  const decimal = (value) => ({ mantissa: Math.round(value * 10 ** 6), scale: 6 });
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers.map((number) => ({
      ...number,
      initial: decimal(number.initial),
      min: decimal(number.min),
      max: decimal(number.max),
      student_control: {
        ...number.student_control,
        step: decimal(number.student_control.step),
      },
    })),
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: { summary: plan.close.summary },
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  Object.assign(outline, modelCourseVisualStructure(plan, drafts));
  const visual = drafts[0].course_visual_creates.visual_1.content;
  visual.parameters.formulas = ["x", "x^2", "sin(x)"];
  visual.parameters.curve_labels = ["y = x", "y = x^2", "y = sin(x)"];

  const generated = await generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    const section = JSON.parse(request.prompt).section_to_write;
    return JSON.stringify(drafts[section - 1]);
  }, {
    turn_id: "turn-static-function-comparison",
    learner_request: "把 y=x、y=x^2 和 y=sin(x) 画在同一个坐标系中。",
    request_parts: ["把 y=x、y=x^2 和 y=sin(x) 画在同一个坐标系中。"],
  });

  const plot = generated.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.deepEqual(
    plot.content.curves.map((curve) => [curve.expression, curve.label]),
    [
      ["x", "y = x"],
      ["(x)^(2)", "y = x^2"],
      ["sin(x)", "y = sin(x)"],
    ],
  );
  assert.equal(plot.content.points, undefined, "a static comparison must not inherit a stray moving point");
  assert.equal(
    generated.lesson.lesson.variables?.[0]?.control,
    undefined,
    "an unbound model number must not create a dead slider",
  );
  assert.equal(
    generated.lesson.steps.flatMap((step) => step.beats)
      .flatMap((beat) => beat.actions)
      .some((action) => action.do === "animate"),
    false,
    "an unbound model number must not leave a dead animation",
  );
  assert.equal(generated.lesson.lesson.activities, undefined);

  const noisyDrafts = structuredClone(drafts);
  const noisyVisual = noisyDrafts[0].course_visual_creates.visual_1.content;
  noisyVisual.parameters.formulas = ["x", "x", "x^2"];
  noisyVisual.parameters.expression = "x^9";
  noisyVisual.parameters.expressions = ["x^8"];
  noisyVisual.parameters.curve_labels = ["mismatched label"];
  noisyVisual.numbers = [1];
  const normalized = await generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
    const section = JSON.parse(request.prompt).section_to_write;
    return JSON.stringify(noisyDrafts[section - 1]);
  }, {
    turn_id: "turn-noisy-static-function-comparison",
    learner_request: "比较 y=x 和 y=x^2。",
    request_parts: ["比较 y=x 和 y=x^2。"],
  });
  const normalizedPlot = normalized.lesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "plot",
  );
  assert.deepEqual(
    normalizedPlot.content.curves.map((curve) => [curve.expression, curve.label]),
    [
      ["x", "y = x"],
      ["(x)^(2)", "y = (x)^(2)"],
    ],
  );
  assert.equal(normalizedPlot.content.points, undefined);
  assert.equal(normalized.lesson.lesson.variables?.[0]?.control, undefined);

  const invalidDrafts = structuredClone(drafts);
  invalidDrafts[0].course_visual_creates.visual_1.content.parameters.formulas = ["x+n1", "x^2"];
  await assert.rejects(
    () => generateLessonPlanWithModel(async (request) => {
      if (request.label === "lesson-plan-outline") return JSON.stringify(outline);
      const section = JSON.parse(request.prompt).section_to_write;
      return JSON.stringify(invalidDrafts[section - 1]);
    }, {
      turn_id: "turn-invalid-dynamic-function-comparison",
      learner_request: "比较两条会随同一个数值变化的曲线。",
      request_parts: ["比较两条会随同一个数值变化的曲线。"],
    }, {
      max_attempts_per_part: 1,
    }),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_EXPRESSION"
      && /multi-curve comparison currently supports static formulas only/u.test(error.message),
  );
});

test("the course outline creates one visual position and later sections can only reuse it", async () => {
  const plan = completeLessonPlanFixtures.quadratic_translation;
  const decimal = (value) => ({ mantissa: Math.round(value * 10 ** 6), scale: 6 });
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers.map((number) => ({
      ...number,
      initial: decimal(number.initial),
      min: decimal(number.min),
      max: decimal(number.max),
      student_control: { ...number.student_control, step: decimal(number.student_control.step) },
    })),
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2, 3] }],
    course_visuals: [{
      required_features: ["cartesian_function_curve"],
      create_section: 1,
      use_sections: [1, 2, 3],
      relation: "primary",
    }],
    sections: plan.sections.map(({ purpose, reusable_items }) => ({
      purpose,
      reusable_items: (reusable_items ?? []).filter((item) => item.board_kind !== "visual"),
    })),
    close: { summary: plan.close.summary },
  };
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({
    version: plan.version,
    section: index + 1,
    moments,
    ...(student_activities ? { student_activities } : {}),
  }));
  const firstVisual = drafts[0].moments.flatMap((moment) => moment.visual_creates)[0];
  const canonicalFirstVisual = structuredClone(firstVisual);
  delete canonicalFirstVisual.reusable_item;
  delete canonicalFirstVisual.content.capability;
  drafts[0].course_visual_creates = { visual_1: { moment: 1, ...canonicalFirstVisual } };
  delete drafts[0].moments[0].visual_creates;
  const calls = [];
  const generated = await generateLessonPlanWithModel(async (request) => {
    calls.push(request);
    if (request.part === "outline") return JSON.stringify(outline);
    return JSON.stringify(drafts[request.section - 1]);
  }, {
    turn_id: "turn-course-visual-registry",
    learner_request: "解释 h 和 k 如何平移同一条抛物线。",
    request_parts: ["解释 h 和 k 如何平移同一条抛物线。"],
  });

  assert.equal(generated.outline.course_visuals.length, 1);
  assert.deepEqual(generated.outline.course_visuals[0], {
    capability: "function_plot",
    create_section: 1,
    use_sections: [1, 2, 3],
    relation: "primary",
    reusable_item: 1,
  });
  const sectionCalls = calls.filter((call) => call.part === "section");
  const firstPrompt = JSON.parse(sectionCalls[0].prompt);
  const secondPrompt = JSON.parse(sectionCalls[1].prompt);
  assert.equal(firstPrompt.visuals_for_section[0].mode, "create");
  assert.equal(secondPrompt.visuals_for_section[0].mode, "reuse");
  assert.ok(sectionCalls[0].response_schema.properties.course_visual_creates.properties.visual_1);
  assert.equal("visual_creates" in sectionCalls[0].response_schema.properties.moments.items.properties, false);
  assert.equal("visual_creates" in sectionCalls[1].response_schema.properties.moments.items.properties, false);
  const plots = generated.lesson.steps.flatMap((step) => step.beats)
    .flatMap((beat) => beat.actions)
    .filter((action) => action.do === "write" && action.kind === "plot");
  assert.equal(plots.length, 1);
});

test("an explicitly unsupported request stops before any section model call", async () => {
  const plan = completeLessonPlanFixtures.unit_circle_to_sine;
  const outline = {
    version: plan.version,
    title: plan.title,
    goals: plan.goals,
    numbers: plan.numbers,
    request_coverage: [
      { request_part: 1, treatment: "teach", sections: [1] },
      { request_part: 2, treatment: "unsupported", sections: [], reason: "the requested interaction is unavailable" },
    ],
    sections: plan.sections.map(({ purpose, reusable_items, moments }) => ({
      purpose,
      allowed_capabilities: [...new Set(moments.flatMap((moment) => moment.actions)
        .filter((action) => action.action === "create" && action.kind === "visual")
        .map((action) => action.content.capability))],
      ...(reusable_items ? { reusable_items } : {}),
    })),
    close: plan.close,
  };
  Object.assign(outline, modelCourseVisualStructure(plan));
  const calls = [];
  await assert.rejects(
    () => generateLessonPlanWithModel(async (request) => {
      calls.push(request.label);
      return JSON.stringify(outline);
    }, {
      turn_id: "turn-unsupported-before-sections",
      learner_request: "请讲解这个概念，并展示当前不支持的交互。",
      request_parts: ["讲解这个概念", "展示当前不支持的交互"],
    }),
    (error) => error instanceof LessonPlanError
      && error.code === "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
  );
  assert.deepEqual(calls, ["lesson-plan-outline"]);
});
