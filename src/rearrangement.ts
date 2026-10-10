import { LessonPlanError } from "./lesson-plan.js";

/** One definition supplies the compiler labels and the model's compact teaching facts. */
export const REARRANGEMENT_CONSTRUCTIONS = {
  right_triangle_square: {
    title: "直角三角形重排与面积关系",
    catalog: "4全等直角三角形；外框a+b；留白c²→a²+b²（勾股）",
    pieces: "4个全等直角三角形（两直角边a、b，斜边c）",
    shows: "c² = a² + b²",
    container: "外框边长a+b，面积(a+b)²；不是边长c的正方形",
    initial: "四个三角形围住边长c的正方形留白，面积c²",
    final: "三角形拼成两个ab矩形，留白为a²和b²两个正方形",
    proof: "比较两个端点：(a+b)² − 4×ab/2 = c² = a²+b²",
    caption: "外框边长 a+b。起点留白 c² → 终点留白 a²+b²；四个三角形的总面积始终为 4×ab/2。比较两种布局的留白：c² = a²+b²。",
  },
  square_area_identity: {
    title: "正方形分块与面积恒等式",
    catalog: "a²、b²、ab、ab四块（无三角形）→边长a+b正方形，证(a+b)²=a²+2ab+b²",
    pieces: "a²、b²两个正方形和两个ab矩形，无三角形",
    shows: "(a+b)² = a² + 2ab + b²",
    container: "外框边长a+b，面积(a+b)²",
    initial: "四块分离：a²、ab、ab、b²",
    final: "四块填满边长a+b的正方形",
    proof: "整块面积等于四块面积之和：(a+b)²=a²+2ab+b²",
    caption: "a²、b² 两个正方形与两个 ab 矩形拼合，得到边长 a+b 的正方形：(a+b)² = a²+2ab+b²。",
  },
  triangle_to_rectangle: {
    title: "两个全等三角形拼成长方形",
    catalog: "2全等直角三角形→ab矩形，每块面积ab/2",
    pieces: "2个全等直角三角形拼成矩形",
    shows: "S△ = ab / 2",
    container: "外框是边长a、b的矩形，面积ab",
    initial: "两个全等直角三角形分离",
    final: "两个三角形填满矩形",
    proof: "两个全等三角形的面积之和为ab，所以每个面积ab/2",
    caption: "两个全等直角三角形拼成边长 a、b 的矩形；每个三角形面积 S△ = ab/2。",
  },
} as const;
export type RearrangementConstruction = keyof typeof REARRANGEMENT_CONSTRUCTIONS;
export const REARRANGEMENT_FACTS = REARRANGEMENT_CONSTRUCTIONS;

/** Short catalog text, derived from the same endpoint facts used by the renderer. */
export const REARRANGEMENT_MODEL_GUIDANCE = "重排进度，不改边长；" + Object.entries(REARRANGEMENT_CONSTRUCTIONS)
  .map(([name, facts]) => `${name}：${facts.catalog}`).join("；") + "。面积只比较端点。";

export type RigidPose = { x: number; y: number; angle?: number };
type RigidPiece = {
  points: Array<[number, number]>;
  start: RigidPose;
  end: RigidPose;
  label: string;
  tone: "primary" | "secondary" | "accent" | "neutral";
};
export type RearrangementRecipe = {
  title: string;
  relation: string;
  target: Array<[number, number]>;
  pieces: RigidPiece[];
};

export function rearrangementRecipe(
  construction: unknown,
  first: number,
  second: number,
  path: string,
): RearrangementRecipe {
  const definition = REARRANGEMENT_CONSTRUCTIONS[construction as RearrangementConstruction];
  if (!definition) throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
  const gap = Math.max(first, second) * 0.35;
  if (construction === "right_triangle_square") {
    const side = first + second;
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, label: "三角形 1", tone: "primary" },
        { points: [[0, 0], [0, first], [-second, 0]], start: { x: side, y: 0 }, end: { x: side, y: second }, label: "三角形 2", tone: "secondary" },
        { points: [[0, 0], [-first, 0], [0, -second]], start: { x: side, y: side }, end: { x: first, y: second }, label: "三角形 3", tone: "accent" },
        { points: [[0, 0], [0, -first], [second, 0]], start: { x: 0, y: side }, end: { x: first, y: side }, label: "三角形 4", tone: "neutral" },
      ],
    };
  }
  if (construction === "square_area_identity") {
    const side = first + second;
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [first, first], [0, first]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "a²", tone: "primary" },
        { points: [[0, 0], [second, 0], [second, first], [0, first]], start: { x: first + gap, y: 0 }, end: { x: first, y: 0 }, label: "ab", tone: "secondary" },
        { points: [[0, 0], [first, 0], [first, second], [0, second]], start: { x: 0, y: side + gap }, end: { x: 0, y: first }, label: "ab", tone: "accent" },
        { points: [[0, 0], [second, 0], [second, second], [0, second]], start: { x: side + gap, y: side + gap }, end: { x: first, y: first }, label: "b²", tone: "neutral" },
      ],
    };
  }
  if (construction === "triangle_to_rectangle") {
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [first, 0], [first, second], [0, second]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "三角形 1", tone: "primary" },
        { points: [[0, 0], [first, 0], [0, second]], start: { x: first + gap, y: 0 }, end: { x: first, y: second, angle: Math.PI }, label: "三角形 2", tone: "accent" },
      ],
    };
  }
  throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
}

