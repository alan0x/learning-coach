// Turns complete Lesson Plan fixtures into the model responses Coach expects,
// for tests and for the offline payload measurement (scripts/measure-lesson-payload.mjs).
import assert from "node:assert/strict";

export function modelResponseHelpers(LESSON_PLAN_CAPABILITY_REGISTRY) {
  function sectionModelResponse(request, drafts) {
    return JSON.stringify(drafts[request.section - 1]);
  }

  function bootstrapModelResponse(request, outline, firstSection, options = {}) {
    const course = { outline, first_section: firstSection };
    if (request.response_schema.properties?.disposition) {
      return JSON.stringify({
        disposition: "generate_lesson",
        learner_response: "",
        ...(request.response_schema.properties.image_observation ? {
          image_observation: options.image_observation ?? {
            readability: "readable",
            observed_content: "测试画面中的学习内容",
            uncertainties: [],
          },
        } : {}),
        course,
      });
    }
    return JSON.stringify(course);
  }

  function bootstrapSectionFromExact(outline, firstSection) {
    const broad = {
      moments: structuredClone(firstSection.moments),
      ...(firstSection.number_activities ? { number_activities: structuredClone(firstSection.number_activities) } : {}),
      ...(firstSection.scene3d_activities ? { scene3d_activities: structuredClone(firstSection.scene3d_activities) } : {}),
    };
    for (const [key, source] of Object.entries(firstSection.course_visual_creates ?? {})) {
      const position = Number(key.replace("visual_", ""));
      const { moment, ...entry } = structuredClone(source);
      const target = broad.moments[moment - 1];
      target.visual_creates ??= [];
      target.visual_creates.push({
        ...entry,
        course_visual: position,
        content: {
          ...entry.content,
        },
      });
    }
    for (const [key, source] of Object.entries(firstSection.reusable_board_creates ?? {})) {
      const position = Number(key.replace("item_", ""));
      const declared = outline.sections[0].reusable_items[position - 1];
      const { moment, ...entry } = structuredClone(source);
      const target = broad.moments[moment - 1];
      const collection = declared.board_kind === "math" ? "math_creates" : "note_creates";
      target[collection] ??= [];
      target[collection].push({ ...entry, reusable_item: position });
    }
    return broad;
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
        ...(moment.restart_numbers ? { restart_numbers: moment.restart_numbers } : {}),
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
          const capability = entry.content.capability;
          delete entry.course_visual;
          delete entry.reusable_item;
          delete entry.content.capability;
          if (capability === "function_plot" && entry.content.parameters?.expression !== undefined) {
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

  function stagedOutline(plan, drafts, { canonical = true } = {}) {
    const outline = {
      version: plan.version,
      title: plan.title,
      goals: plan.goals,
      numbers: plan.numbers,
      request_coverage: [{
        request_part: 1,
        treatment: "teach",
        sections: plan.sections.map((_section, index) => index + 1),
      }],
      close: { summary: plan.close.summary },
    };
    Object.assign(outline, modelCourseVisualStructure(plan, drafts, { canonical }));
    return outline;
  }

  return {
    sectionModelResponse,
    bootstrapModelResponse,
    bootstrapSectionFromExact,
    modelFormula,
    toModelSectionDraft,
    modelCourseVisualStructure,
    stagedOutline,
    modelActionCollectionNames,
  };
}
