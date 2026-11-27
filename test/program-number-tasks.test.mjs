// Pilot 2 (2026-11-27, Coach main 859ec70), MT-07 lost: section 2 drew a number line in steps beside the make-ten card
// on the walk's numbers the program supplies, and wrote a learner task (a slider) on "the step to ten". Those numbers
// have no learner control (their values are the pair's), OLL refused the slider, and the refusal named no picture, so
// nothing could be withdrawn: the lesson failed after its repairs.
// - A task with a slider on a number the program supplied is not run: dropped and recorded, with no call.
// - Any OLL refusal that names a variable a learner task works drops that task, never the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const run = (body) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
  const api = await import(${here("../lesson-plan.js")});
  const sp = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  ${body}
`], { env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "make_ten" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }));

test("MT-07: a slider task on the walk's step to ten is dropped and recorded; section 2 is accepted at once and the lesson is made", () => {
  const result = run(`
    const { reusable_item: _slot, ...steps } = structuredClone(sp.samplePlan("number_line_steps").sections[0].moments[0].actions.find((action) => action.action === "create"));
    const plan = sp.makeTenPlan({ numbers: [4, 9], practice: [3, 8] });
    plan.sections[1].reusable_items = [...(plan.sections[1].reusable_items ?? []), { kind: "board_item", board_kind: "visual", capability: "number_line_steps" }];
    plan.sections[1].moments.push({ narration: "数轴上走。", actions: [{ ...steps, content: { ...steps.content, numbers: [7, 8, 9] }, role: "supporting_visual", placement: { relation: "new_region" }, reusable_item: plan.sections[1].reusable_items.length }] });
    plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] };
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const outline = H.stagedOutline(compatible, drafts);
    outline.numbers = outline.numbers.slice(0, 4);
    const log = { requests: [], rejected: [], adjustments: [] };
    try {
      log.lesson = (await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, outline, H.bootstrapSectionFromExact(outline, drafts[0]));
        const draft = structuredClone(drafts[request.section - 1]);
        const numbers = JSON.parse(request.prompt).course_and_section.numbers;
        const ids = ["数轴的起点（大数）", "补成十的一步", "剩下的一步"].map((label) => numbers.find((number) => number.label === label)?.number);
        for (const entry of Object.values(draft.course_visual_creates ?? {})) if (JSON.stringify(entry.content.numbers) === "[7,8,9]") entry.content.numbers = ids;
        // The model's task (pilot 2, MT-07, attempt 2): set the step to ten to 1.
        draft.number_activities = [{ prompt: "在数轴上，把补成十的第一步步长设为1", hints: ["从9跳到10需要几步？"], success_message: "太棒了！", number: ids[1], value_mantissa: 1, value_scale: 0 }];
        return JSON.stringify(draft);
      }, { turn_id: "mt-07", learner_request: "4 + 9 怎么凑十？拆哪个数算得快？", language: "zh-CN" }, {
        max_attempts_per_part: 3,
        on_rejected_part: (part) => log.rejected.push([part.section, part.error.code, part.error.message.slice(0, 160)]),
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.number ?? null, adjustment.reason]),
      })).lesson;
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const variables = log.lesson?.lesson.variables ?? [];
    console.log(JSON.stringify({ error: log.error, requests: log.requests, rejected: log.rejected, adjustments: log.adjustments,
      walk: variables.filter((variable) => ["number_07", "number_08", "number_09"].includes(variable.as)).map((variable) => [variable.as, variable.initial, variable.control ?? null]),
      tasks: (log.lesson?.lesson.tasks ?? []).map((task) => task.allowed_operations?.map((operation) => operation.variable ?? operation.node).join(",")) }));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2"]);
  assert.deepEqual(result.adjustments.filter(([kind]) => kind === "number_interaction_removed"), [["number_interaction_removed", 2, 8, "activity_slider_on_program_number"]]);
  // The walk is the pair's: from 9, one step to ten, three more; no control on any of it, and no task works it.
  assert.deepEqual(result.walk, [["number_07", 9, null], ["number_08", 1, null], ["number_09", 3, null]]);
  assert.ok(result.tasks.every((variables) => !/number_0[789]/u.test(variables ?? "")), JSON.stringify(result.tasks));
});

test("an OLL refusal that names a variable a learner task works picks that task; other refusals and tasks are left alone", () => {
  const result = run(`
    const target = (number, expression) => ({ kind: "number_target", prompt: "p", number_controls: [{ number, controls: ["slider"] }], ...(expression ? { expression } : {}), value: 1, tolerance: 0.1, hints: ["h"] });
    const typed = { kind: "numeric_answer", prompt: "p", answer: "3", check: "1+2", reference: { source: "reusable", section: 1, item: 1 }, hints: ["h"] };
    const activities = [target(8), target(2, [{ kind: "number", number: 9 }]), target(3), typed];
    const refused = (message, code = "LESSON_PLAN_OLL_SEMANTIC") => api.learnerTasksOllRefused(new api.LessonPlanError(code, "$lesson", message), activities).map((activity) => activities.indexOf(activity));
    console.log(JSON.stringify({
      control: refused("$lesson: Task control 'slider' is not available for variable 'number_08' in this lesson"),
      expression: refused("$lesson: Variable 'number_09' is not declared"),
      none: refused("$lesson: A beat needs at least one action"),
      otherCode: refused("$lesson: Task control 'slider' is not available for variable 'number_08' in this lesson", "LESSON_PLAN_ACTIVITY"),
    }));
  `);
  assert.deepEqual(result, { control: [0], expression: [1], none: [], otherCode: [] });
});
