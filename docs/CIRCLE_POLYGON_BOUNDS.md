# 圆与正多边形周长夹逼

新增 Lesson Plan capability `circle_polygon_bounds`，与 `circle_and_arc` 并列。用于内接、外切正多边形同时夹逼固定圆周长，不能用边数充当弧度。

模型选用 side_count 数值和 radius 参数；编译器将边数约束到 3–384 的整数、滑块步长 1，并校正动画终点及活动目标到可达整数。输出为一个 OLL geometry，包含固定圆、两条 regular_polygons 声明与两条 round(number) 绑定。顶点、周长和周长/直径由共享数学函数计算，复用现有播放器交互。

能力特征为 inscribed_regular_polygon、circumscribed_regular_polygon、perimeter_bounds；生成提示中提供公式及 96 边的准确计算结果。不增加模型调用或生成阶段。

验证：全部 202 项技能测试通过，包括能力注册、特征匹配、整数活动目标、编译结果、无角度控制点与旧能力回归。运行时及前端验证见对应仓库。
