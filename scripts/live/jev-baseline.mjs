// Jev subject-identification baseline. Calls Jev through Octos Learn's signed-in
// BYOK relay with the account's saved key (the key never reaches this script).
// Variant A: today's admission gate question, verbatim (src/learning/admission-fast-gate.ts).
// Variant B: the plugin-based subject question proposed in the subject plugin plan.
import { readFile, writeFile } from 'node:fs/promises';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local dev certificate on 127.0.0.1:5173 only
const LEARN = process.env.LEARN_ORIGIN ?? 'https://127.0.0.1:5173';
const OUT = process.argv[2];
const LIMIT = Number(process.argv[3] ?? 200);
const coach = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const suite = JSON.parse(await readFile(`${coach}/eval/subject-routing-cases.json`, 'utf8'));
const math = JSON.parse(await readFile(`${coach}/testsuite/math-natural-course-cases.json`, 'utf8'));
const mathById = new Map(math.cases.map((c) => [c.id, c]));
const cases = [
  ...suite.math_cases_by_reference.ids.map((id) => ({ id, category: 'math', language: 'zh-CN', prompt: mathById.get(id).prompt, expected_plugins: ['math'] })),
  ...suite.cases,
];

const solo = await (await fetch('http://127.0.0.1:50080/api/auth/solo', { method: 'POST' })).json();
const headers = { Authorization: `Bearer ${solo.token}`, 'content-type': 'application/json' };
const byok = await (await fetch(`${LEARN}/api/learn/byok`, { headers })).json();
const admission = byok.services?.admission;
if (!admission?.has_credential) throw new Error('Jev is not configured');

const disposition = (current) => ({
  type: 'choice',
  instructions: current
    ? "判断用户当前的输入是否构成一个清晰、可实质性展开教学的学习主题或提问。state.current_lesson 是同一块白板上刚讲过的内容；输入指向其中的题目或内容时（如'反思题我不会'、'刚才那道题'），指代是清楚的"
    : '判断用户当前的输入是否构成一个清晰、可实质性展开教学的学习主题或提问',
  criteria: {
    generate_lesson: `提出了具体的学习问题、概念解释或明确的学习主题（包括简短但清晰的主题，如'勾股定理'、'为什么负负得正'）${current ? '，或明确指向 current_lesson 里的题目或内容' : ''}`,
    clarify: `是真实的口语，但内容残缺不全、指代不明或缺少主干${current ? '，在 current_lesson 里也找不到所指' : ''}，需要向用户追问（如'这本书'、'刚才那个'）`,
    ignore: "仅为语气词、口头填充、停顿、唤醒词或无实际教学意图的噪音（如'呃'、'啊对'、'嗯'、'好'）",
  },
});
const selfContained = (current) => ({ type: 'noul', instructions: `该输入是否无需额外依赖上下文即可独立理解并直接展开一堂课？${current ? '（state.current_lesson 不算额外上下文）' : ''}` });
const SUBJECT_A = {
  type: 'choice',
  instructions: '如果该内容涉及学习主题，判断其最可能所属的主学科领域',
  criteria: {
    math: '数学（代数、几何、函数、微积分、概率等）',
    physics: '物理与工程技术',
    general_science: '化学、生物及常规自然科学',
    language_humanities: '语言、文学、历史与人文社科',
    other: '日常常识或其他非典型学科',
  },
};
const SUBJECT_B = {
  type: 'choice',
  instructions: '判断讲清这个学习请求最需要哪一门学科的教学工具。请求同时涉及两门学科时，把概率分给这两门；无法判断或不属于下列学科时选 unclear',
  criteria: {
    math: '数学：数与运算、代数、函数与图像、几何、统计与概率',
    physics: '物理：运动与力、能量、电路、光、声、浮力等',
    chemistry: '化学：物质与变化、原子与分子、化学方程式、溶液、酸碱',
    biology: '生物：细胞、植物与动物、人体、生态、遗传与生长',
    unclear: '无法判断学科，或属于以上之外的学科',
  },
};

async function ask(item, variant) {
  const current = item.current_lesson;
  const payload = {
    state: {
      learner_request: item.prompt,
      input_modality: 'text',
      has_camera_frame: item.request_source === 'current_image',
      has_selection: item.request_source === 'ink_selection',
      ...(current ? { current_lesson: current } : {}),
    },
    questions: { disposition: disposition(current), subject: variant === 'A' ? SUBJECT_A : SUBJECT_B, is_self_contained: selfContained(current) },
    model: admission.params?.model || 'jev-latest',
  };
  const started = performance.now();
  const response = await fetch(`${LEARN}/api/learn/byok/admission/relay`, {
    method: 'POST', headers,
    body: JSON.stringify({ provider: admission.provider, params: admission.params, expected_revision: admission.revision, payload }),
  });
  const latency_ms = Math.round(performance.now() - started);
  const relay = await response.json().catch(() => null);
  if (response.status !== 200 || !relay || relay.status < 200 || relay.status >= 300) {
    return { http_status: response.status, provider_status: relay?.status, code: relay?.code, latency_ms };
  }
  const answers = JSON.parse(relay.body).answers;
  return { http_status: 200, latency_ms, answers };
}

const rows = [];
let calls = 0;
for (const item of cases) {
  for (const variant of ['A', 'B']) {
    if (calls >= LIMIT) break;
    calls += 1;
    let result;
    try { result = await ask(item, variant); } catch (error) { result = { error: error.message }; }
    rows.push({ id: item.id, category: item.category, language: item.language, variant, expected_plugins: item.expected_plugins,
      acceptable_plugins: item.acceptable_plugins ?? [], expected_disposition: item.expected_disposition ?? 'generate_lesson', ...result });
    await writeFile(OUT, JSON.stringify({ model: admission.params?.model, calls, rows }, null, 2));
  }
}
console.log(JSON.stringify({ calls, failures: rows.filter((r) => r.http_status !== 200).length }));
