#!/usr/bin/env node

import {
  buildVertexSchemaContract,
  createVertexClient,
  probeVertexSchema,
} from "../main";

const twoPi = Math.PI * 2;

function baseBrief(goal, extra = {}) {
  return {
    version: "1",
    request_summary: goal,
    request_items: [{
      id: "teach-goal",
      source_ref: "learner_request:1",
      kind: "teaching_goal",
      polarity: "require",
    }],
    non_requirement_clauses: [],
    teaching_goal_requirements: [{ id: "goal", goal, request_item_ids: ["teach-goal"] }],
    presentation_constraints: [],
    visual_requirements: [],
    visual_relationships: [],
    shared_variable_requirements: [],
    progressive_revision_kinds: [],
    unhandled_request_items: [],
    ...extra,
  };
}

const cases = [
  {
    id: "basic-board",
    request: "请解释为什么负负得正",
    brief: baseBrief("解释负负得正"),
  },
  {
    id: "sine-plot",
    request: "请画出正弦函数图像并解释周期",
    brief: {
      ...baseBrief("解释正弦函数周期"),
      request_items: [
        { id: "teach-goal", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
        { id: "show-plot", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
      ],
      visual_requirements: [{
        id: "sine-plot",
        surface: "plot",
        purpose: "展示正弦函数周期",
        required_features: ["coordinate_axes", "function_curve"],
        expressions: ["sin(x)"],
        request_item_ids: ["show-plot"],
      }],
    },
  },
  {
    id: "coordinate-circle",
    request: "请在坐标系里画一个圆并解释半径",
    brief: {
      ...baseBrief("解释圆的半径"),
      request_items: [
        { id: "teach-goal", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
        { id: "show-circle", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
      ],
      visual_requirements: [{
        id: "circle",
        surface: "geometry",
        purpose: "展示坐标圆和半径",
        required_features: ["coordinate_axes", "equal_scale", "circle", "radius_segment"],
        expressions: [],
        request_item_ids: ["show-circle"],
      }],
    },
  },
  {
    id: "unit-circle-to-sine",
    request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
    brief: {
      ...baseBrief("解释单位圆旋转与正弦周期波动的关系"),
      request_items: [
        { id: "teach-goal", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
        { id: "show-circle", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
        { id: "show-plot", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
        { id: "relate", source_ref: "learner_request:1", kind: "relationship", polarity: "require" },
        { id: "show-change", source_ref: "learner_request:1", kind: "continuous_change", polarity: "require" },
      ],
      visual_requirements: [
        {
          id: "unit-circle",
          surface: "geometry",
          purpose: "展示单位圆旋转与投影",
          required_features: [
            "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
            "point_on_circle", "radius_segment", "projection_segment", "angle_arc",
          ],
          expressions: [],
          request_item_ids: ["show-circle"],
        },
        {
          id: "sine-plot",
          surface: "plot",
          purpose: "展示正弦周期波动",
          required_features: ["coordinate_axes", "function_curve"],
          expressions: ["sin(x)"],
          request_item_ids: ["show-plot"],
        },
      ],
      visual_relationships: [{
        id: "circle-to-plot",
        from: "unit-circle",
        to: "sine-plot",
        relation: "maps_to",
        request_item_ids: ["relate"],
      }],
      shared_variable_requirements: [{
        id: "theta-control",
        variable: "theta",
        purpose: "同一角度驱动两张图",
        initial: 0,
        min: 0,
        max: twoPi,
        label: "旋转角 θ",
        unit: "rad",
        slider_step: 0.01,
        animate_to: twoPi,
        easing: "linear",
        duration_intent: "extended",
        bound_visuals: ["unit-circle", "sine-plot"],
        direct_angle_geometry: "unit-circle",
        request_item_ids: ["show-change"],
      }],
      student_task_requirements: [{
        id: "reach-sine-maximum",
        prompt: "把圆周点拖到 sin θ = 1",
        variable: "theta",
        controls: ["slider", "geometry_point"],
        completion_expression: "sin(theta)",
        completion_value: 1,
        tolerance: 0.01,
        hints: ["观察圆周点的纵坐标。", "把圆周点拖到最高点。"],
        hint_after_attempts: 2,
        success_message: "正确，正弦值已经达到最大值。",
        request_item_ids: ["teach-goal", "show-change"],
      }],
    },
  },
];

const client = await createVertexClient();
let failed = false;
for (const item of cases) {
  const input = {
    turn_id: `contract-${item.id}`,
    learner_request: item.request,
    request_source: "self_contained",
    language: "zh-CN",
  };
  const { schema, diagnostics, capabilityPlan } = buildVertexSchemaContract(input, item.brief);
  const result = await probeVertexSchema(client, schema);
  process.stdout.write(`${JSON.stringify({
    id: item.id,
    ...diagnostics,
    write_kinds: capabilityPlan.writeKinds,
    actions: capabilityPlan.actions,
    ...result,
  })}\n`);
  if (!result.ok) failed = true;
}

if (failed) process.exitCode = 1;
