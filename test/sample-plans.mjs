// Fixed one-recipe lesson plans, one per registered capability, shared by the
// lesson-plan tests and the request-hash golden check.

export function reusable(section, item, part) {
  return {
    source: "reusable",
    section,
    item,
    ...(part ? { part } : {}),
  };
}

export function localBoardItem(moment, item) {
  return { source: "local_board_item", moment, item };
}

export function staticFunctionTokens(expression) {
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

export function makeSamplePlanModelCompatible(plan) {
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "text") continue;
        action.kind = "note";
        action.content = { title: "补充说明", items: [action.content.text] };
      }
    }
  }
  return plan;
}

export function samplePlan(capability) {
  // solid_3d takes no outline numbers: it makes its own cut or unfold slider (OLL decision 0019).
  const numberCount = capability === "process_diagram" || capability === "solid_3d"
    ? 0
    : capability === "rectangle_unit_square_array" || capability === "number_line_compare" || capability === "base_ten_trade" || capability === "place_value_chart"
      ? 2
      : capability === "number_line_steps"
        ? 3
        : 1;
  // The number line's question types (decisions 0013 and 0016): the parameters each one needs.
  const numberLineParameters = { number_line_solution: { relation: "x>a" }, number_line_rounding: { place: "tens" } }[capability];
  const hasNumber = numberCount > 0;
  const is3d = capability === "solid_3d"
    || capability === "function_surface_with_section"
    || capability === "implicit_surface_with_section";
  const firstMomentActions = [
    {
      action: "create",
      kind: "visual",
      role: "main_visual",
      content: {
        capability,
        parameters: capability === "function_plot"
          ? { expression: "x^2", sample_x_numbers: [1] }
          : capability === "implicit_surface_with_section"
            ? { expression: "x^2+y^2+z^2", level: 1, section_axis: "z" }
          : capability === "solid_3d"
            ? { solids: [{ shape: "cylinder", radius: 2, height: 5 }], show: ["volume"], interaction: "cut" }
            : capability === "place_value_chart"
            ? { given: "name" }
            : numberLineParameters ?? {},
        ...(hasNumber ? { numbers: Array.from({ length: numberCount }, (_unused, index) => index + 1) } : {}),
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
      end_value: capability === "base_ten_trade" ? 4 : capability === "place_value_chart" ? 4050 : capability === "circle_polygon_bounds" ? 96 : capability === "rectangle_unit_square_array" ? 6 : capability === "number_line_rounding" ? 43 : capability === "number_line_steps" ? 7 : 0.75,
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
      numbers: Array.from({ length: numberCount }, (_unused, index) => capability === "circle_polygon_bounds"
        ? { initial: 6, min: 6, max: 96, label: "多边形边数", unit: "边", student_control: {kind:"slider",step:1} }
        : capability === "number_line_rounding"
        ? { initial: 47, min: 40, max: 50, label: "要取整的数", student_control: { kind: "slider", step: 1 } }
        : capability === "number_line_steps"
        ? [
            { initial: 8, min: 5, max: 9, label: "start", student_control: { kind: "slider", step: 1 } },
            { initial: 2, min: 1, max: 3, label: "first move" },
            { initial: 3, min: 1, max: 4, label: "second move" },
          ][index]
        : capability === "base_ten_trade"
        // The trading mat (OLL decision 0023): 14 loose ones and 2 tens; the ones are traded down to 4.
        ? { initial: index === 0 ? 14 : 2, min: 0, max: 20, label: index === 0 ? "loose ones" : "tens" }
        : capability === "place_value_chart"
        // The place-value chart (OLL decision 0025): 4,050 built from its name, all at once (the value on the
        // chart goes from 0 to 4,050); the learner builds 3,207.
        ? { initial: index === 0 ? 4050 : 3207, min: 0, max: index === 0 ? 4050 : 3207, label: index === 0 ? "the number" : "practice number" }
        : capability === "number_line_compare"
        ? { initial: index === 0 ? 0.5 : 0.25, min: 0, max: 1, label: index === 0 ? "first" : "second", student_control: { kind: "slider", step: 0.05 } }
        : capability === "rectangle_unit_square_array"
        ? {
            initial: index === 0 ? 5 : 3,
            min: 1,
            max: index === 0 ? 10 : 8,
            label: index === 0 ? "columns / length" : "rows / width",
            student_control: { kind: "slider", step: 0.25 },
          }
        : {
            initial: capability === "coordinate_circle" ? 1 : 0,
            min: capability === "coordinate_circle" ? 0.25 : capability === "geometric_rearrangement" ? 0 : -1,
            max: capability === "coordinate_circle" ? 3 : 1,
            label: index === 0 ? "main value" : `value ${index + 1}`,
            student_control: { kind: "slider", step: 0.05 },
          }),
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
            value: capability === "place_value_chart" ? 3207 : capability === "circle_polygon_bounds" ? 96 : capability === "number_line_rounding" ? 45 : capability === "number_line_steps" ? 6 : 0.5,
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

/**
 * The chart's value after each place of a number is done, highest place first, as the guidance asks: building,
 * the value on the chart (60408 -> [60000, 60400, 60408]); pulling apart, what is still on it ([408, 8, 0]).
 */
export function placeValueSteps(number, build = true) {
  const thousandths = Math.round(number * 1000);
  const parts = String(thousandths).split("").map((digit, index, all) => Number(digit) * 10 ** (all.length - 1 - index)).filter(Boolean);
  const sum = (list) => Number((list.reduce((total, part) => total + part, 0) / 1000).toFixed(3));
  return parts.map((_part, index) => (build ? sum(parts.slice(0, index + 1)) : sum(parts.slice(index + 1))));
}

/**
 * A lesson on the place-value chart (OLL decision 0025), as the model writes one: the question's number and a
 * practice number as lesson numbers, what the card gives, the demonstration as targets on the number (what is
 * the value on the chart, built up from 0 or still on it as it is pulled apart, `steps`, one moment each: by default
 * a place at a time), the practice as a number target, and
 * (to build) a typed question after it. Compiled through the real pipeline by the tests.
 */
export function placeValuePlan({ number, practice, given, steps = placeValueSteps(number, given !== "numeral"), prompt, hints = ["Say each place's value as you go."], typed = given !== "numeral" }) {
  const plan = samplePlan("place_value_chart");
  plan.numbers = [
    { initial: number, min: 0, max: number, label: "the number" },
    ...(practice !== undefined ? [{ initial: practice, min: 0, max: practice, label: "practice number" }] : []),
  ];
  const first = plan.sections[0].moments[0];
  first.actions = first.actions.filter((action) => action.action !== "animate");
  first.actions[0].content = { capability: "place_value_chart", parameters: { given }, numbers: practice !== undefined ? [1, 2] : [1] };
  plan.sections[0].moments.push(...steps.map((left, index) => ({
    narration: `Step ${index + 1}.`,
    actions: [{ action: "animate", number: 1, end_value: left, duration_intent: "brief", timing: "during_speech" }],
  })));
  plan.sections[0].student_activities = [{
    kind: "number_target",
    prompt: prompt ?? (given === "numeral" ? "Your turn: pull the number on the chart apart." : "Your turn: build the number the card gives."),
    number_controls: [{ number: 1, controls: ["slider"] }],
    value: practice ?? number, tolerance: 0.5, hints,
  }];
  if (typed) {
    plan.sections[1].student_activities = [{
      kind: "numeric_answer", prompt: "What number did you build?", answer: String(practice ?? number), check: String(practice ?? number),
      reference: reusable(1, 1), hints: ["Read the chart from the left."],
    }];
  }
  return plan;
}

/**
 * The fixtures behind the request-hash check: the complete course fixtures
 * plus one model-compatible sample per registered recipe, so every recipe's
 * rules and section facts appear in some request.
 */
export function requestHashFixtures(registry, courseFixtures) {
  const fixtures = { ...courseFixtures };
  for (const capability of Object.keys(registry)) {
    const plan = makeSamplePlanModelCompatible(samplePlan(capability));
    // Without steps the diagram is removed and the sample has nothing to close on.
    if (capability === "process_diagram") plan.sections[0].moments[0].actions[0].content.parameters = { steps: ["观察", "计算", "验证"] };
    fixtures[`sample_${capability}`] = plan;
  }
  return fixtures;
}
