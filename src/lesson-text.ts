/** Only program-owned teaching text. Model-authored and learner text stay intact. */
const EN: Readonly<Record<string, string>> = {
  "函数图像": "Function graph", "单位圆与投影": "Unit circle and projection", "{{v0}}函数图像": "{{v0}} function graph", "正弦": "Sine", "余弦": "Cosine",
  "旋转角与周期波动": "Rotation angle and periodic variation", "单位圆与函数图像": "Unit circle and function graph",
  "圆与正多边形的周长夹逼": "Bounding a circle's circumference with regular polygons", "内接正多边形": "Inscribed regular polygon", "外切正多边形": "Circumscribed regular polygon",
  "绿色内接周长 < 圆周长 < 橙色外切周长。除以直径 2r：n sin(π/n) < π < n tan(π/n)。显示值为近似值；边数增加时上下界共同逼近 π。": "Green inscribed perimeter < circle circumference < orange circumscribed perimeter. Dividing by the diameter 2r gives n sin(π/n) < π < n tan(π/n). Displayed values are approximations; both bounds approach π as the number of sides increases.",
  "圆、圆心角与圆弧": "Circle, central angle, and arc", "半径 r": "Radius r", "圆弧": "Arc", "弹簧振子的往复运动": "Oscillation of a spring and mass",
  "位移": "Displacement", "固定端": "Fixed end", "平衡位置": "Equilibrium position", "物体": "Mass", "回复力": "Restoring force", "位移随相位变化": "Displacement versus phase", "相位": "Phase", "当前状态": "Current state", "同一时刻的位移": "Displacement at the same instant", "弹簧运动与函数图像": "Spring motion and function graph",
  "正方体、顶点、棱、面与截面": "Cube, vertices, edges, faces, and sections", "一个中心在原点、边长为 2 的正方体，标出了顶点、棱、面和水平截面。": "A cube centred at the origin with side length 2, showing a vertex, an edge, a face, and a horizontal section.",
  "正方体": "Cube", "水平截面": "Horizontal section", "顶点": "Vertex", "棱": "Edge", "面": "Face", "函数曲面与截面": "Function surface and section", "函数曲面 z={{v0}} 与可变截面。": "Function surface z={{v0}} with a variable section.",
  "截面": "Section", "隐式曲面与截面": "Implicit surface and section", "隐式曲面 {{v0}}={{v1}} 与可变轴向截面。": "Implicit surface {{v0}}={{v1}} with a variable axis-aligned section.", "坐标系中的圆": "Circle in a coordinate system",
  "单位正方形铺成长方形": "Tiling a rectangle with unit squares", "每个小方格面积为 1 平方单位；每行方格数 × 行数 = 方格总数 = 长方形面积。": "Each square has an area of 1 square unit. Squares per row × number of rows = total squares = area of the rectangle.",
  "每行方格数（长）": "Squares per row (length)", "行数（宽）": "Number of rows (width)", "1 平方单位": "1 square unit",
  "{{v0}} 等分圆的面积重排": "Rearranging a circle divided into {{v0}} sectors",
  "半径 r={{v0}}；每块均为真实扇形，重排面积不变。有限等分的边缘仍弯曲；等分越细，底趋近 πr，高趋近 r，面积为 πr²。": "Radius r={{v0}}. Each piece is a true sector, and rearranging preserves area. With finitely many sectors the edges remain curved. As the sectors become finer, the base approaches πr and the height approaches r; the area is πr².",
  "开始": "Start", "观察变化": "Observe the change", "得到结论": "Draw a conclusion", "下一步": "Next step", "过程图": "Process diagram", "数值": "the value",
  "请把{{v0}}调到 {{v1}}{{v2}}。": "Set {{v0}} to {{v1}}{{v2}}.", "完成，{{v0}}已经调到 {{v1}}{{v2}}。": "Done: {{v0}} is now {{v1}}{{v2}}.",
  "继续观察已有的同一画面": "Continue observing the same existing visual", "继续观察当前画面": "Continue observing the current visual",
  "拖动左下角的滑杆，观察数值和画面同步变化。": "Drag the slider at the bottom left and watch the value and visual change together.",
  "目前还不能完整生成这节课，因为其中包含尚未支持的画面或互动。": "This lesson cannot be generated in full yet because it includes visuals or interactions that are not supported.",
  "目前还不能在同一张函数图中同时展示静态曲线和由控件改变的另一条曲线。": "A static curve and another curve changed by a control cannot yet be shown together in the same graph.",
  "课程内容仍在继续生成。": "The rest of the lesson is still being generated.",
  "当前白板只能执行二维图形和三维场景，不能精确模拟四维超立方体的四维旋转。你可以改问它的三维投影原理或基本结构。": "The board supports 2D diagrams and 3D scenes, but cannot accurately simulate a 4D hypercube rotating in four dimensions. You can ask about its 3D projections or basic structure instead.",
  "A点的x坐标": "x-coordinate of point A", "B点的x坐标": "x-coordinate of point B",
  "我没能稳定读清这次手写选区，请重新框选，或者把公式写大一些再试一次。": "I could not read the selected handwriting reliably. Select it again, or write the formula larger and try again.",
  "我没能稳定读取这次摄像头画面，请把题目或物体放到画面中央后再试一次。": "I could not read this camera image reliably. Place the question or object in the centre and try again.",
  "目前还不能完整生成这节课：{{v0}}": "This lesson cannot be generated in full yet: {{v0}}",
};
export function lessonText(language: string | undefined, source: string, values: Record<string, unknown> = {}): string {
  const message = /^en(?:-|$)/i.test(language ?? "") ? EN[source] ?? source : source;
  return message.replace(/\{\{(\w+)\}\}/g, (token, key: string) => String(values[key] ?? token));
}
const languages = new WeakMap<object, string | undefined>();
export function setLessonTextLanguage(plan: object, language: string | undefined): void { languages.set(plan, language); }
export function compileText(plan: object, source: string, values?: Record<string, unknown>): string {
  return lessonText(languages.get(plan), source, values);
}
