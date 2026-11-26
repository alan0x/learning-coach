// Mathematics: number, algebra, functions and graphs, geometry, statistics and probability.
// Subject plugin (decision 0012, draft). Coach assembles its recipe registry
// and the recipe rules in its prompts from the installed plugins.
import { REARRANGEMENT_MODEL_GUIDANCE } from "../rearrangement.js";
import { MATH_PLUGIN_MANIFEST, MATH_SUBJECT_DESCRIPTION } from "octos-lesson-language/plugin-math";
import type { CoachSubjectPlugin } from "./types.js";
import { PLOT_MARKS } from "./plot-mark-names.js";

// Counts a recipe draws, as whole numbers from min to max. The compiler fits slider ranges to them and
// refuses a stated count outside them (Coach #78); the card text quotes the same numbers.
const SIDE_COUNT = { min: 3, max: 384 } as const;
const UNIT_SQUARES_PER_SIDE = { min: 1, max: 8 } as const;

// The first camera of a math 3D scene (OLL's solids builder starts here too). A "turn to this view" task is
// judged against it: a view already this close counts as reached before the learner moves.
const SCENE_FIRST_CAMERA = { yaw: 0.72, pitch: 0.55, zoom: 1 } as const;

export const MATH_RECIPES = {
  function_plot: {
    parts: ["whole", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["curve_parameter_1", "curve_parameter_2", "curve_parameter_3", "curve_parameter_4"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max", "marks", "pieces", "points", "sample_labels"],
    model_parameter_names: ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "sample_labels", "points", "curve_label", "curve_labels", "x_label", "y_label", "marks", "pieces"],
    required_model_schema_parameters: ["formulas"],
    // Marks change what the plot draws, so two plots differing only in marks are different visuals.
    semantic_parameters: ["expression", "expressions", "expression_tokens", "sample_x_numbers", "sample_labels", "points", "marks", "pieces"],
    output_kinds: ["plot"],
    // Its lesson numbers are read from its parameters (formula references and sample_x_numbers): the
    // model writes no number list, and none is assumed for it.
    numbers_in_parameters: true,
    // The view is framed to the numbers it binds, so their ranges stay as they are once its section has
    // been published; a later animation may not widen them.
    ranges_fixed_once_shown: true,
    student_controls: ["slider"],
    required_features: ["cartesian_function_curve"],
    model_guidance: "函数图：公式引用滑块改曲线；采样点另声明",
  },
  unit_circle_projection: {
    parts: ["whole", "unit_circle", "moving_point", "radius", "projection_line", "primary_curve", "primary_control"],
    number_inputs: ["angle"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title", "projection"],
    model_parameter_names: ["title", "projection"],
    required_model_schema_parameters: ["projection"],
    semantic_parameters: ["projection"],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["unit_circle", "projection", "cartesian_function_curve"],
    model_guidance: "单位圆动点、投影线和正弦或余弦曲线共享同一个角度",
  },
  circle_polygon_bounds: {
    parts: ["whole", "circle", "inscribed_polygon", "circumscribed_polygon", "primary_control"],
    number_inputs: ["side_count"],
    number_input_policies: [{ kind: "side_count", ...SIDE_COUNT }],
    parameter_names: ["title", "radius"],
    model_parameter_names: ["title", "radius"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["inscribed_regular_polygon", "circumscribed_regular_polygon", "perimeter_bounds"],
    model_guidance: `圆周率/割圆术：固定圆与内接、外切正多边形，整数边数${SIDE_COUNT.min}..${SIDE_COUNT.max}，周长与周长÷直径上下界实时计算；边数不是角度。适合圆周率数值计算、割圆法和上下界逼近，例如‘圆周率是什么，它是如何计算的’；同一画面中的固定圆可供定义部分讲解复用，配合周长与直径比值公式，再通过增加多边形边数解释计算过程`,
  },
  circle_and_arc: {
    parts: ["whole", "circle", "arc", "radius", "primary_control"],
    number_inputs: ["angle", "radius"],
    number_input_policies: [{ kind: "angle" }, { kind: "positive" }],
    parameter_names: ["title", "radius", "angle"],
    model_parameter_names: ["title", "radius", "angle"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "angle"],
    output_kinds: ["geometry"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["circle", "arc"],
    model_guidance: "圆、圆心角、半径和圆弧；两个数值依次控制角度和半径；不支持用边数冒充角度或用圆弧冒充正多边形。适合需要观察圆心角、圆弧或弧长关系的讲解；若只需要展示整圆、解释圆周长与直径的比值，不应仅因涉及‘圆’就选择本能力；本能力绘制圆、圆弧与半径，不会展示周长与直径的比值",
  },
  cube_with_section: {
    parts: ["whole", "solid", "vertex", "edge", "face", "section", "primary_control"],
    number_inputs: ["section_height"],
    number_input_policies: [{ kind: "bounded", min: -1, max: 1 }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    initial_camera: SCENE_FIRST_CAMERA,
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["solid_3d", "section_plane"],
    model_guidance: "可旋转正方体、顶点、棱、面和可变水平截面",
  },
  function_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "samples", "section_axis", "section_value", "x_min", "x_max", "y_min", "y_max"],
    model_parameter_names: ["title", "expression", "section_axis", "section_value"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "section_axis"],
    initial_camera: SCENE_FIRST_CAMERA,
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["function_surface_3d", "section_plane"],
    model_guidance: "可旋转三维函数曲面、可变截面和真实交线",
  },
  implicit_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "level", "section_axis"],
    model_parameter_names: ["title", "expression", "level", "section_axis"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "level", "section_axis"],
    initial_camera: SCENE_FIRST_CAMERA,
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["implicit_surface_3d", "section_plane"],
    model_guidance: "三变量隐式曲面 F(x,y,z)=c，以及垂直于 x、y 或 z 轴的可变截面和真实交线",
  },
  coordinate_circle: {
    parts: ["whole", "circle", "center", "radius", "primary_control"],
    number_inputs: ["radius"],
    number_input_policies: [{ kind: "positive" }],
    parameter_names: ["title", "radius", "radius_expression", "center_x", "center_y"],
    model_parameter_names: ["title", "radius", "radius_expression", "center_x", "center_y"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "radius_expression", "center_x", "center_y"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["coordinate_circle"],
    model_guidance: "坐标系中的圆；共享数值可通过 radius_expression（例如 sqrt(n1)）驱动半径",
  },
  // Decision 0019 (amended by 0020): the model writes each solid's shape and the sizes the question states,
  // which measures to show and whether a cut or a net is wanted; the program computes the measures, builds
  // the slider and its range, and places a second solid beside the first. A trial until its speed gate.
  solid_3d: {
    parts: ["whole", "solid", "beside", "section", "primary_control"],
    number_inputs: [],
    number_input_policies: [],
    parameter_names: ["title", "solids", "join", "show", "interaction"],
    model_parameter_names: ["title", "solids", "join", "show", "interaction"],
    // show is required so the model decides it every time (probe 2: asked-for surface areas left out).
    required_model_schema_parameters: ["solids", "show"],
    semantic_parameters: ["solids", "join", "show", "interaction"],
    initial_camera: SCENE_FIRST_CAMERA,
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    // Its own feature, so the model can ask for it by name; with section_plane, a cut through any of its
    // shapes routes here, while solid_3d with section_plane still means the teaching cube.
    required_features: ["solids", "section_plane"],
    model_guidance: "立体都选solids（含截面展开），尺寸固定不建数；2个并排，join叠放或拼L；问到的体积/表面积/面棱顶点都写show，无盖不写表面积",
  },
  // Decision 0021 (amended): the model writes the fractions as values and what the card shows; the program
  // draws the parts, decides the wholes, the grid and the marked share. A trial until its probe and gate.
  fraction_model: {
    parts: ["whole", "a", "b"],
    number_inputs: [],
    number_input_policies: [],
    parameter_names: ["title", "fractions", "fraction_shape", "fraction_view", "split_each_part"],
    model_parameter_names: ["title", "fractions", "fraction_shape", "fraction_view", "split_each_part"],
    required_model_schema_parameters: ["fractions", "fraction_view"],
    semantic_parameters: ["fractions", "fraction_shape", "fraction_view", "split_each_part"],
    output_kinds: ["fraction_model"],
    student_controls: [],
    required_features: ["fraction_parts"],
    // The program may draw the card's next step as a revision (0021 amendment 2: a fraction, then its cut).
    revised_by_program: true,
    model_guidance: "分数等分图：fractions写分子分母的值；view：one、compare两个、equivalent等值、split把每份再分split_each_part份求每份、share把a个整体平分给b份写a/b；shape：bar/circle/grid（百分之几用grid）；不用于不等分、一组物体的几分之几、比；大于1写一个假分数",
  },
  // OLL decision 0023 (a trial), rebuilt 2026-11-23: the trading mat on lesson numbers.
  base_ten_trade: {
    parts: ["whole", "ones", "tens", "hundreds"],
    // The pile is lesson numbers, as every earlier component's values are (owner, 2026-11-23): the model
    // declares them in the outline, moves them in its own moments and writes the practice.
    number_inputs: ["loose_ones", "tens", "hundreds"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: [],
    model_parameter_names: [],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["base_ten_trade"],
    // No control: the learner works the mat by its own taps (OLL 0023 amendment 5; owner, 2026-11-24: the
    // model never names a control).
    student_controls: [],
    required_features: ["trade_ten_for_one"],
    model_guidance: "方块换一换：十个一换一个十，十个十换一个百。数值依次是散的一、十的个数，题目有百或一共满100时再加百的个数（没有百写0），照题目写。一共满100时画板有百位：十满十也要换成一个百，通常讲到每一位都不到十为止。讲到交换的那一刻把“一”的数值动画到换完的个数（一次少整十，如26到6），十自己跟着多；换百就把“十”动画到换完的个数（如11到1），百自己跟着多。方块的总数永远不变，只能交换：把一堆变成另一个数（如508加3个十变成538）不能在方块上练，用填数题问。课后练习时方块回到课程开头那一堆，孩子自己换；那一堆已经是目标时，从课程结束时那一堆开始，所以“换回”开头的个数也可以。练习的目标是交换路上“一”或“十”的某个个数（摆面画好以后，visuals_for_section 给出 loose_ones_as_traded、tens_as_traded），说成“换成几个”，不说“调到”；方块上的练习要练本课 goals 里的交换。提示讲数学（如十个一换一个十），不讲怎么操作。填数题另出新题时用文字说一堆新的方块，题目只写回答要用的话，不加和这道题无关的事实。说方块只用数位的名字：一、十、百（如“10个十换成1个百”），不另起名字（如“十条”“百板”）",
  },
  // OLL decision 0025 (offered by default since 2026-11-26, owner): the place-value chart on lesson numbers, on the trading mat's
  // pattern. The model writes the question's number and a different practice number, what the card gives, the
  // demonstration as targets on the number (the value on the chart: built up from 0, or what is still on it as it is pulled apart) and the practice;
  // the program writes every number text on the card, plays the steps and makes the learner's task.
  place_value_chart: {
    parts: ["whole"],
    number_inputs: ["number", "practice"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["given"],
    model_parameter_names: ["given"],
    required_model_schema_parameters: ["given"],
    semantic_parameters: ["given"],
    output_kinds: ["place_value_chart"],
    // Two lesson variables a column: when a lesson holds too many, the chart is the picture that goes.
    binds_many_variables: true,
    // No control: the learner works the chart by its own taps (+, a disk, take out); the model never names one.
    student_controls: [],
    required_features: ["place_value_parts"],
    model_guidance: "数位表：照读法、展开式或每一位有几个摆出一个数，或把一个数按数位一位一位拆开（到百万位和千分位）。不用于比较两个数、十个这一位是左边一位的一个、在表上加减、凑整，也不用于低年级的十个一换一个十（用方块）。数值依次是题目的数和练习的数（另一个数，不是题目的，免得孩子照抄演示），数值写这个数本身（如 0.309），不写 0：表一开始是空的，由程序摆，写实际大小（26.075），最多三位小数。given 是卡片上给出的：摆数写 name（读法）、expanded（值的和，如 4,000 + 50）、expanded_factors（如 4 × 1,000 + 5 × 10）或 place_counts（如 8个千、6个十和3个一）；拆数写 numeral，拆的数有小数时整数部分英文课不超过三位、中文课不超过四位。只有一位不是零的数（4000、0.05）不用 expanded，也不拆。带乘号的小数写法（3 × (1/10)）只用于英文五年级的小数题或题目自己这样写；中文课用 place_counts（3个0.1、9个0.01和2个0.001）或值的和（0.3 + 0.09 + 0.002）。卡片上的读法、展开式和数字都由程序写。摆数演示时把题目的数动画到表上现在的值：从 0 起，每一步摆上一位或几位，通常从最高位起（60408：先到 60000，再到 60400，最后 60408）；后面的节再写这个数，表不变。拆数演示时把题目的数动画到表上还剩的：每一步拿出一位或几位，如 60408 先到 408，再到 8，最后到 0。练习：对题目的数写一个数值目标题（数值写练习的数），孩子在表上摆出或拆开练习的数；摆数题的题目和提示不写练习的数（卡片上已经给出它的读法或展开式）；拆完以后程序出一行空，写每一部分是多少。说数位用名字（千位、十分位、hundreds），不说怎么点卡片",
  },
  rectangle_unit_square_array: {
    parts: ["whole", "unit_square", "row", "column", "interior", "boundary", "primary_control", "secondary_control"],
    number_inputs: ["columns_or_length", "rows_or_width"],
    // Both numbers are required: the builder draws no rectangle without its columns and rows.
    number_input_policies: [{ kind: "positive_integer", ...UNIT_SQUARES_PER_SIDE, required: true }, { kind: "positive_integer", ...UNIT_SQUARES_PER_SIDE, required: true }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["unit_square_array", "row_column_count", "area_boundary_comparison"],
    model_guidance: "单位正方形按行列铺满长方形；两个整数依次控制每行方格数（长）和行数（宽），用于面积、周长与平方单位教学",
  },
  geometric_rearrangement: {
    parts: ["whole", "target_shape", "outer_square", "piece_1", "piece_2", "piece_3", "piece_4", "central_area", "leg_a", "leg_b", "hypotenuse", "primary_control"],
    number_inputs: ["progress"],
    number_input_policies: [{ kind: "normalized_progress" }],
    parameter_names: ["title", "construction", "leg_a", "leg_b"],
    model_parameter_names: ["title", "construction", "leg_a", "leg_b"],
    required_model_schema_parameters: ["construction"],
    parameter_options: {
      construction: ["right_triangle_square", "square_area_identity", "triangle_to_rectangle"],
    },
    semantic_parameters: ["construction", "leg_a", "leg_b"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["polygon_pieces", "rigid_rearrangement", "area_relation"],
    model_guidance: REARRANGEMENT_MODEL_GUIDANCE,
  },
  circle_area_rearrangement: {
    parts: ["whole", "primary_control"],
    number_inputs: ["progress"],
    number_input_policies: [{kind:"normalized_progress"}],
    parameter_names: ["title", "radius"],
    model_parameter_names: ["title", "radius"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["circle_area_rearrangement"],
    model_guidance: "圆面积：扇形等积重排，底趋近πr、高趋近r",
  },
  number_line: {
    parts: ["whole", "start", "end", "move", "primary_control"],
    number_inputs: ["start", "change"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }],
    // The model gives only the numbers, at their actual size; the program decides the parts per
    // unit and the hops. (A `denominator` parameter made the model write numerators: 3 for 3/4.)
    // label_style is how the question writes its numbers (0.8 or 8/10), which only the model sees;
    // it changes the labels, never the values.
    parameter_names: ["title", "label_style"],
    model_parameter_names: ["title", "label_style"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line"],
    model_guidance: "数轴加减：a + b 起点 a、移动 b，终点由程序算；数值写实际大小（3/4 写 0.75）；问位置时起点 0；按分数数数时移动写一步（0.25）；题目写小数时 label_style 用 decimal",
  },
  // Decision 0016: comparing two numbers. Each is a point; the ticks hold both (their common
  // denominator, up to 24 parts per unit). The shared rules (actual size, label_style) are on the
  // number line's card; this card adds one line.
  number_line_compare: {
    parts: ["whole", "first", "second", "primary_control"],
    number_inputs: ["first", "second"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "label_style"],
    model_parameter_names: ["title", "label_style"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line", "number_comparison"],
    model_guidance: "数轴比较两个数：两个数值各画一点（2/3 和 3/5 也能画）",
  },
  // Decision 0016: a solution set. The model names the relation and gives the boundaries (solved first);
  // the program draws open or filled ends and the rays or interval.
  number_line_solution: {
    parts: ["whole", "set", "set2", "primary_control"],
    number_inputs: ["a", "b"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "label_style", "relation"],
    model_parameter_names: ["title", "label_style", "relation"],
    required_model_schema_parameters: ["relation"],
    semantic_parameters: ["relation"],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line", "solution_set"],
    model_guidance: "数轴画不等式解集：先解出边界；relation 写解集形式，数值依次是 a、b（|x−3|<2 写 a<x<b，a=1，b=5）",
  },
  // Decision 0016: rounding. The model gives the number and the place; the program draws the two
  // neighbours, the halfway point and the jump to the result.
  number_line_rounding: {
    parts: ["whole", "number", "lower", "upper", "middle", "move", "primary_control"],
    number_inputs: ["number"],
    number_input_policies: [{ kind: "unbounded" }],
    parameter_names: ["title", "place"],
    model_parameter_names: ["title", "place"],
    required_model_schema_parameters: ["place"],
    semantic_parameters: ["place"],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line", "rounding"],
    model_guidance: "数轴四舍五入：数值是要取整的数，place 写哪一位；两侧的数和结果由程序算",
  },
  // Decision 0017: two or three moves, each its own jump (make ten, tens then ones, up then down). The model
  // gives the start and each move; the program computes where each lands and the end. Its card states the
  // split from the one-move card itself, so the one-move card is unchanged.
  number_line_steps: {
    parts: ["whole", "start", "end", "move", "move2", "move3", "primary_control"],
    number_inputs: ["start", "change_1", "change_2", "change_3"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "label_style"],
    model_parameter_names: ["title", "label_style"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line", "number_steps"],
    model_guidance: "数轴分步：两到三步的加减（数轴加减是一步），如凑十、先整十再个位、上下移动；数值依次是起点和各步移动量（两步写两个），落点和终点由程序算；往回走的一步不讲一格一格",
  },
} as const;

// Provider-schema properties each recipe adds to a visual's parameters.
// Strings carry no length keywords (the Vertex schema endpoint rejects them);
// the Lesson Plan validator enforces the limits after generation.
const text = { type: "string" } as const;
const MATH_SCHEMA_PROPERTIES = {
  // The compiler derives legends from the formulas when none are supplied.
  function_plot: {
    x_label: text,
    y_label: text,
    formulas: { type: "array", minItems: 1, maxItems: 8, items: text },
    // A point is what the model means: a fixed point {x, y} on the curve, or a dragged point {slider: "n1"}
    // (decision 0020; replaces sample_x_numbers, which asked for an index into the outline's numbers).
    points: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, properties: { x: { type: "number" }, y: { type: "number" }, slider: text, label: text } } },
    marks: { type: "array", maxItems: PLOT_MARKS.length, items: { enum: [...PLOT_MARKS] } },
    pieces: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["formula", "ends"], properties: { formula: text, x_from: { type: "number" }, x_to: { type: "number" }, ends: { enum: ["[]", "[)", "(]", "()"] } } } },
  },
  unit_circle_projection: { projection: { enum: ["sin", "cos"] } },
  circle_polygon_bounds: { radius: { type: "number", minimum: 0 } },
  circle_and_arc: { radius: { type: "number", minimum: 0 }, angle: { type: "number" } },
  function_surface_with_section: { expression: text, section_axis: { enum: ["x", "y", "z"] }, section_value: { type: "number" } },
  implicit_surface_with_section: { expression: text, section_axis: { enum: ["x", "y", "z"] }, level: { type: "number" } },
  coordinate_circle: {
    radius: { type: "number", minimum: 0 },
    radius_expression: text,
    center_x: { type: "number" },
    center_y: { type: "number" },
  },
  geometric_rearrangement: {
    construction: { enum: [...MATH_RECIPES.geometric_rearrangement.parameter_options.construction] },
    leg_a: { type: "number", minimum: 0 },
    leg_b: { type: "number", minimum: 0 },
  },
  circle_area_rearrangement: { radius: { type: "number", minimum: 0 } },
  number_line: { label_style: { enum: ["decimal", "fraction"] } },
  number_line_compare: { label_style: { enum: ["decimal", "fraction"] } },
  number_line_solution: {
    label_style: { enum: ["decimal", "fraction"] },
    relation: { enum: ["x>a", "x>=a", "x<a", "x<=a", "a<x<b", "a<=x<=b", "a<x<=b", "a<=x<b", "x<a|x>b", "x<=a|x>=b", "x<a|x>=b", "x<=a|x>b"] },
  },
  number_line_rounding: { place: { enum: ["hundreds", "tens", "ones", "tenths", "hundredths"] } },
  number_line_steps: { label_style: { enum: ["decimal", "fraction"] } },
  fraction_model: {
    // First, as the solids' array is: the provider writes properties in schema order, and with the shape
    // first the model wrote the shape and view and left the values out (fraction probe 2: 16 of 19 lessons).
    fractions: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", properties: { numerator: { type: "integer" }, denominator: { type: "integer" } }, required: ["numerator", "denominator"] } },
    fraction_shape: { enum: ["bar", "circle", "grid"] },
    fraction_view: { enum: ["one", "compare", "equivalent", "split", "share"] },
    // A choice, not a free integer: as an integer the model filled it with thousands of digits when the view
    // had no use for it (fraction probe 1, 2026-11-19: 13 times in 11 of 23 lessons). Named for what it does:
    // as "split" the model wrote the number of parts there ("split": "6" for sixths) and left out the fractions
    // (probe 2).
    split_each_part: { enum: ["2", "3", "4", "5", "6"] },
  },
  // What the place-value chart gives (OLL 0025): a build form, or the numeral to pull apart. The program writes the text.
  place_value_chart: { given: { enum: ["name", "expanded", "expanded_factors", "place_counts", "numeral"] } },
  solid_3d: {
    // The compiler checks the fields (each solid's shape and sizes), so the schema carries no strictness keywords.
    solids: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", properties: {
      shape: { enum: ["box", "cylinder", "cone", "sphere", "hemisphere", "prism", "pyramid", "frustum"] },
      // The provider writes properties in schema order, so every shape's sizes must come in an order it can
      // follow: height last. With height third, a cylinder written radius first had nowhere left for its
      // height and put it in side (probe 1, 2026-11-17: 11 of 16 lessons).
      radius: { type: "number" }, top_radius: { type: "number" }, length: { type: "number" }, width: { type: "number" }, sides: { type: "integer" }, side: { type: "number" }, height: { type: "number" },
    } } },
    // "side" read as "side by side" in probe 2 (4 of 22 lessons asked two separate solids to join): the
    // L shape is named for what it is.
    join: { enum: ["stack", "l_shape"] },
    show: { type: "array", items: { enum: ["volume", "surface_area", "counts"] } },
    interaction: { enum: ["cut", "unfold"] },
  },
};

export const MATH_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: MATH_PLUGIN_MANIFEST,
  subject: { description: MATH_SUBJECT_DESCRIPTION },
  recipes: MATH_RECIPES,
  schema_properties: MATH_SCHEMA_PROPERTIES,
  prompt_rules: {
    "outline.visual_choice": "多边形重排选 polygon_pieces、rigid_rearrangement、area_relation；圆面积选 circle_area_rearrangement。",
    "section.formulas": "function_plot：formulas 写右侧公式，横轴 x。平移曲线写 -(x-n1)^2+n2，不代入初值。点写 points（至多 2 个）：固定点写 x、y（曲线上的值）；学生拖的点写 slider（如 n1，该数是点的横坐标），曲线须固定；不用 content.numbers。多式仅静态比较。固定直线两点斜率不变；重合是0/0。陡峭看斜率绝对值。marks：intercepts 截距、vertex 顶点、symmetry_axis 对称轴（一次或二次）、slope_triangle 两点 Δx Δy、domain 定义域、range 值域；位置由程序算。分段写 pieces（formulas 照写各段）：每段 formula、x_from、x_to（无界不写）、ends 开闭如 [)，可为常数。",
    "section.bounds": "圆周率割圆/正多边形逼近选内接正多边形、外切正多边形和周长上下界特征；边数用整数，不可用圆弧角度替代。上下界由图形计算，讲解用 n sin(π/n) < π < n tan(π/n)。",
    "section.linked_numbers": "半径与共享量有函数关系时，coordinate_circle 写 radius_expression（如 sqrt(n1)），不写固定 radius=2 代替联动，也不要把高度直接当半径。",
    "section.constructions": "geometric_rearrangement 按构造事实讲解；a、b固定，控件只改变重排进度。复用依 visuals_for_section 的构造与当前状态，先前动画终值不会自动归零；重演需显式 restart_numbers，否则观察当前布局。圆面积用 circle_area_rearrangement。数值为重排进度；有限扇形非矩形，等分趋细时底→πr、高→r。",
  },
} as const satisfies CoachSubjectPlugin;
