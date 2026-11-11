#!/usr/bin/env node
// Payload experiment (subject plan P2, scaled down by the owner 2026-11-10):
// does about 8 KB more recipe guidance and schema in the first request cost
// first-playable time?
//
// Each run goes through Coach's real lesson generator and production model
// client (the route Octos injects) and stops as soon as the first section is
// playable, so it measures exactly the first-playable path, including any
// repair before it. Padded and unpadded runs alternate in pairs; the order
// within a pair alternates too.
//
// Uses the owner's model key; run only with the owner's approval. The route
// and key come from the same variables Octos injects (OCTOS_PROFILE_LLM_PROVIDER,
// OCTOS_PROFILE_LLM_MODEL, GEMINI_API_KEY, ...); nothing is printed or written
// about them except the provider and model.
//
//   node scripts/eval-payload-padding.mjs --pairs 20 [--pad-bytes 8192] [--max-calls 60] [--out <report.json>]
//     [--octos-profile ~/.octos/profiles/<id>.json] [--start-pair <n> --append <earlier report.json>]
//
// --octos-profile reads the profile's primary lesson model (family, model and
// the key variable it names) inside this process, as Octos does when it runs
// the skill. Nothing from it is printed except the provider and model.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Recipe cards of other subjects' future tools: what a broad request carries
// once more plugins are installed. The response schema still offers only
// today's recipes, so the model cannot choose these.
const FUTURE_CARDS = [
  ["vector_addition", "物理", "两个力或速度向量首尾相接，合向量随滑杆改变方向和长度，分量投影到坐标轴"],
  ["free_body_diagram", "物理", "物体受力分析图：重力、支持力、摩擦力、拉力的方向与大小，可逐个显示"],
  ["projectile_motion", "物理", "平抛与斜抛轨迹，水平和竖直分运动同步显示，初速度和角度可调"],
  ["circuit_series_parallel", "物理", "串联与并联电路，电流表和电压表读数随电阻改变"],
  ["lens_ray_diagram", "物理", "凸透镜与凹透镜成像光路，物距改变时像的位置、大小和虚实变化"],
  ["wave_superposition", "物理", "两列波叠加，振幅和相位差可调，观察加强与减弱"],
  ["particle_model_states", "化学", "固液气三态的粒子模型，温度改变时粒子间距与运动速度变化"],
  ["reaction_balance", "化学", "化学方程式配平，原子在反应前后逐个对应，系数可调"],
  ["periodic_trend", "化学", "元素周期表中原子半径、电负性等性质随周期和族的变化"],
  ["titration_curve", "化学", "酸碱滴定曲线，加入体积与 pH 的关系，标出等当点"],
  ["solubility_curve", "化学", "物质溶解度随温度变化的曲线，比较饱和与不饱和溶液"],
  ["cell_structure", "生物", "动植物细胞结构对比，细胞核、线粒体、叶绿体、细胞壁逐个标注"],
  ["mitosis_stages", "生物", "有丝分裂各时期染色体变化，按前期中期后期末期逐步播放"],
  ["food_web_energy", "生物", "食物网与能量金字塔，每一营养级的能量传递比例"],
  ["punnett_square", "生物", "孟德尔遗传的棋盘格，亲代基因型改变时子代表型比例变化"],
  ["population_growth", "生物", "种群增长的指数与逻辑斯谛曲线，环境容纳量可调"],
  ["water_cycle_diagram", "地球与宇宙", "水循环示意图：蒸发、凝结、降水、径流按顺序高亮"],
  ["seasons_orbit", "地球与宇宙", "地球绕太阳公转与地轴倾斜，夏至冬至太阳直射点变化"],
  ["moon_phases", "地球与宇宙", "月相变化：太阳、地球、月球位置关系与看到的亮面"],
  ["plate_boundaries", "地球与宇宙", "板块边界类型：张裂、碰撞、错动，与地震火山分布的关系"],
  ["rock_cycle", "地球与宇宙", "岩石循环：岩浆岩、沉积岩、变质岩之间的转化过程"],
  ["weather_front", "地球与宇宙", "冷锋暖锋过境时气温、气压、降水的变化"],
];

/** Neutral padding text of at least `bytes` UTF-8 bytes, built deterministically from the cards. */
export function paddingText(bytes, header) {
  const lines = [header];
  for (let round = 0; Buffer.byteLength(lines.join("\n")) < bytes; round += 1) {
    const [name, subject, text] = FUTURE_CARDS[round % FUTURE_CARDS.length];
    const suffix = round < FUTURE_CARDS.length ? "" : `_${Math.floor(round / FUTURE_CARDS.length) + 1}`;
    lines.push(`- ${name}${suffix}（${subject}，本次请求未开放）：${text}`);
  }
  return lines.join("\n");
}

/**
 * Pad the first request: most of the bytes as unavailable recipe cards in the
 * system prompt, the rest as a schema description. Returns the bytes added.
 */
export function padRequest(request, padBytes) {
  const promptBytes = Math.round(padBytes * 0.65);
  const schemaBytes = padBytes - promptBytes;
  const promptPad = paddingText(promptBytes, "\n\n其他学科的工具（本次请求未开放，不要选用）：");
  const schemaPad = paddingText(schemaBytes, "Other subjects' tools, not offered in this request:");
  const before = Buffer.byteLength(request.system_prompt) + Buffer.byteLength(JSON.stringify(request.response_schema));
  const padded = {
    ...request,
    system_prompt: request.system_prompt + promptPad,
    response_schema: { ...request.response_schema, description: [request.response_schema.description, schemaPad].filter(Boolean).join("\n") },
  };
  const after = Buffer.byteLength(padded.system_prompt) + Buffer.byteLength(JSON.stringify(padded.response_schema));
  return { request: padded, added_bytes: after - before };
}

class StopAfterFirstPlayable extends Error {}

/** The environment Octos injects for a profile's primary lesson model. */
export async function profileRouteEnvironment(path) {
  const config = JSON.parse(await readFile(path, "utf8")).config ?? {};
  const primary = config.llm?.primary;
  const keyVariable = primary?.route?.api_key_env;
  if (!primary?.family_id || !primary?.model_id) throw new Error("the profile has no primary lesson model");
  if (typeof keyVariable !== "string" || !/^[A-Z0-9_]{1,64}$/u.test(keyVariable)) throw new Error("the profile route names no key variable");
  const key = config.env_vars?.[keyVariable];
  if (typeof key !== "string" || !key.trim()) throw new Error(`the profile has no value for ${keyVariable}`);
  return {
    OCTOS_PROFILE_LLM_PROVIDER: primary.family_id,
    OCTOS_PROFILE_LLM_MODEL: primary.model_id,
    [keyVariable]: key,
  };
}

export async function runOnce({ generate, call, item, padBytes, turnId, budget, onRejected = () => {} }) {
  const startedAt = Date.now();
  const calls = [];
  let firstPlayableMs;
  let addedBytes = 0;
  const model = async (request) => {
    if (firstPlayableMs !== undefined) throw new StopAfterFirstPlayable();
    if (budget.remaining <= 0) throw new Error("model call budget exhausted");
    budget.remaining -= 1;
    let sent = request;
    if (padBytes && request.part === "bootstrap") {
      const padded = padRequest(request, padBytes);
      sent = padded.request;
      addedBytes = padded.added_bytes;
    }
    const callStartedAt = Date.now();
    const text = await call(sent);
    calls.push({ part: request.part, section: request.section, attempt: request.attempt, elapsed_ms: Date.now() - callStartedAt,
      request_bytes: Buffer.byteLength(sent.system_prompt) + Buffer.byteLength(sent.prompt) + Buffer.byteLength(JSON.stringify(sent.response_schema)) });
    return text;
  };
  let outcome = "first_playable";
  let rejections = 0;
  try {
    // The same input and options as a typed composer request in main.ts.
    await generate(model, { turn_id: turnId, learner_request: item.learner_request, language: "zh-CN", input_modality: "text" }, {
      compile: { language: "zh-CN" },
      // Stopping after the first playable section surfaces as a rejected part;
      // only rejections before it are real (and may steer the router).
      on_rejected_part: (event) => { if (firstPlayableMs === undefined) { rejections += 1; onRejected(event); } },
      on_playable_prefix: () => { if (firstPlayableMs === undefined) firstPlayableMs = Date.now() - startedAt; },
    });
  } catch (error) {
    if (!(error instanceof StopAfterFirstPlayable) && firstPlayableMs === undefined) {
      outcome = "error";
      calls.push({ error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    }
  }
  return {
    case: item.id, padded: Boolean(padBytes), added_bytes: addedBytes, outcome,
    first_playable_ms: firstPlayableMs ?? null,
    calls_before_first_playable: calls.filter((entry) => entry.part).length,
    local_rejections: rejections,
    bootstrap_ms: calls.find((entry) => entry.part === "bootstrap")?.elapsed_ms ?? null,
    calls,
  };
}

/** Median and the paired differences (padded − unpadded) of first-playable time. */
export function summarize(rows) {
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const pairs = new Map();
  for (const row of rows) {
    if (row.outcome !== "first_playable") continue;
    const pair = pairs.get(row.pair) ?? {};
    pair[row.padded ? "padded" : "plain"] = row.first_playable_ms;
    pairs.set(row.pair, pair);
  }
  const differences = [...pairs.values()].filter((pair) => pair.padded !== undefined && pair.plain !== undefined)
    .map((pair) => pair.padded - pair.plain);
  const mean = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
  const sd = differences.length > 1
    ? Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1)) : null;
  const se = sd !== null ? sd / Math.sqrt(differences.length) : null;
  const ok = (padded) => rows.filter((row) => row.padded === padded && row.outcome === "first_playable");
  return {
    complete_pairs: differences.length,
    p50_first_playable_ms: { plain: median(ok(false).map((row) => row.first_playable_ms)), padded: median(ok(true).map((row) => row.first_playable_ms)) },
    p50_bootstrap_ms: { plain: median(ok(false).map((row) => row.bootstrap_ms)), padded: median(ok(true).map((row) => row.bootstrap_ms)) },
    paired_difference_ms: { median: median(differences), mean, ci95: se !== null ? [mean - 1.96 * se, mean + 1.96 * se] : null },
    calls_before_first_playable: { plain: ok(false).reduce((sum, row) => sum + row.calls_before_first_playable, 0), padded: ok(true).reduce((sum, row) => sum + row.calls_before_first_playable, 0) },
    errors: rows.filter((row) => row.outcome === "error").length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const pairs = Number(option("--pairs", "20"));
  const padBytes = Number(option("--pad-bytes", "8192"));
  const maxCalls = Number(option("--max-calls", String(pairs * 3)));
  const out = option("--out");
  if (!Number.isSafeInteger(pairs) || pairs < 1 || !Number.isSafeInteger(padBytes) || padBytes < 1) throw new Error("--pairs and --pad-bytes must be positive integers");
  const profilePath = option("--octos-profile");
  if (profilePath) Object.assign(process.env, await profileRouteEnvironment(profilePath));

  const bundle = await build({
    stdin: {
      contents: `export { createStructuredModelRouter, resolveLessonModelRoute } from "./src/main.ts";
        export { generateLessonPlanWithModel } from "./src/lesson-plan-api.ts";`,
      resolveDir: root, loader: "ts",
    },
    bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent",
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
  const route = api.resolveLessonModelRoute();
  // One router per run, as main.ts creates one per lesson: the router's total
  // time budget and its provider preference belong to a single lesson.
  const newRun = async () => {
    const router = await api.createStructuredModelRouter(route);
    return {
      router,
      call: (request) => router.call({
        label: request.label, turnId: request.turn_id, systemPrompt: request.system_prompt, prompt: request.prompt,
        responseSchema: request.response_schema, lessonPlanPart: request.part, lessonPlanSection: request.section, lessonPlanAttempt: request.attempt,
      }),
    };
  };
  const cases = JSON.parse(await readFile(resolve(root, "eval/lesson-plan-generation-cases.json"), "utf8"));
  const budget = { remaining: maxCalls };
  const startPair = Number(option("--start-pair", "0"));
  const previous = option("--append") ? JSON.parse(await readFile(resolve(option("--append")), "utf8")).rows
    .filter((row) => row.pair < startPair) : [];
  const rows = [...previous];
  const persist = async () => {
    if (!out) return;
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(resolve(out), `${JSON.stringify({ measured_at: new Date().toISOString(), provider: route.provider, model: route.model,
      route_source: route.source, pad_bytes: padBytes, pairs, max_calls: maxCalls, summary: summarize(rows), rows }, null, 1)}\n`);
  };
  console.error(JSON.stringify({ stage: "payload-experiment", provider: route.provider, model: route.model, route_source: route.source, pairs, pad_bytes: padBytes, max_calls: maxCalls }));
  for (let pair = startPair; pair < pairs && budget.remaining > 0; pair += 1) {
    const item = cases[pair % cases.length];
    const order = pair % 2 === 0 ? [0, padBytes] : [padBytes, 0];
    for (const pad of order) {
      const { router, call } = await newRun();
      const row = await runOnce({ generate: api.generateLessonPlanWithModel, call, item, padBytes: pad,
        turnId: `payload-${pair}-${pad ? "padded" : "plain"}-${Date.now()}`, budget, onRejected: () => router.rejectLastResponse() });
      rows.push({ pair, order: order.indexOf(pad), ...row });
      console.error(JSON.stringify({ pair, case: item.id, padded: Boolean(pad), outcome: row.outcome, first_playable_ms: row.first_playable_ms, calls: row.calls_before_first_playable }));
      await persist();
    }
  }
  await persist();
  console.log(JSON.stringify(summarize(rows), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
