// Jev with the image attached, for the 10 camera/selection cases, through the
// Learn product relay that forwards image assets (octos-learn #132; LEARN_ORIGIN, default the
// temporary instance used on 2026-11-09 at http://127.0.0.1:5199). Same proposed
// plugin subject question as variant B, plus the image referenced from state.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const OUT = process.argv[2];
const LEARN = process.env.LEARN_ORIGIN ?? 'http://127.0.0.1:5199';
const suite = JSON.parse(await readFile(new URL('../../eval/subject-routing-cases.json', import.meta.url), 'utf8'));
const images = process.argv[3].replace(/\/?$/, '/');
const solo = await (await fetch('http://127.0.0.1:50080/api/auth/solo', { method: 'POST' })).json();
const headers = { Authorization: `Bearer ${solo.token}`, 'content-type': 'application/json' };
const meta = await (await fetch(`${LEARN}/api/learn/byok`, { headers })).json();
const admission = meta.services.admission;

const SUBJECT_B = {
  type: 'choice',
  instructions: '判断讲清这个学习请求最需要哪一门学科的教学工具（结合 state.image 图片中的内容）。请求同时涉及两门学科时，把概率分给这两门；无法判断或不属于下列学科时选 unclear',
  criteria: {
    math: '数学：数与运算、代数、函数与图像、几何、统计与概率',
    physics: '物理：运动与力、能量、电路、光、声、浮力等',
    chemistry: '化学：物质与变化、原子与分子、化学方程式、溶液、酸碱',
    biology: '生物：细胞、植物与动物、人体、生态、遗传与生长',
    unclear: '无法判断学科（例如图片看不清），或属于以上之外的学科',
  },
};
const DISPOSITION = {
  type: 'choice',
  instructions: '结合 state.image 图片判断用户当前的输入是否构成一个清晰、可实质性展开教学的学习主题或提问；输入用“这个、这道题”指代图片内容时，以图片为准',
  criteria: {
    generate_lesson: '图片或文字给出了具体的学习问题、概念或明确的学习主题',
    clarify: '图片看不清或文字与图片都无法确定要学什么，需要追问',
    ignore: '仅为语气词、噪音或无教学意图',
  },
};

const rows = [];
for (const item of suite.cases.filter((c) => c.image)) {
  const key = randomUUID();
  const payload = {
    model: admission.params?.model || 'jev-latest',
    state: { learner_request: item.prompt, input_modality: 'text', image: key, image_kind: item.request_source === 'ink_selection' ? 'handwritten board selection' : 'camera photo' },
    questions: { disposition: DISPOSITION, subject: SUBJECT_B },
    assets: { [key]: { type: 'image', format: 'png', data_base64: (await readFile(`${images}${item.id}.png`)).toString('base64') } },
  };
  const started = performance.now();
  const response = await fetch(`${LEARN}/api/learn/byok/admission/relay`, { method: 'POST', headers,
    body: JSON.stringify({ provider: admission.provider, params: admission.params, expected_revision: admission.revision, payload }) });
  const latency_ms = Math.round(performance.now() - started);
  const relay = await response.json().catch(() => null);
  const ok = response.status === 200 && relay?.status >= 200 && relay?.status < 300;
  const body = ok ? JSON.parse(relay.body) : null;
  rows.push({ id: item.id, expected_plugins: item.expected_plugins, acceptable_plugins: item.acceptable_plugins ?? [], expected_disposition: item.expected_disposition ?? 'generate_lesson',
    http_status: response.status, provider_status: relay?.status, error_body: ok ? undefined : String(relay?.body ?? relay?.error ?? '').slice(0, 300), latency_ms, model: body?.model, answers: body?.answers });
  await writeFile(OUT, JSON.stringify({ rows }, null, 2));
  const a = body?.answers;
  if (!ok) { console.log('stopping after first failure', item.id, response.status, relay?.status, rows.at(-1).error_body); break; }
  console.log(item.id, response.status, relay?.status, latency_ms + 'ms', a ? `${a.disposition?.choice} ${a.subject?.choice} ${JSON.stringify(a.subject?.probabilities)}` : rows.at(-1).error_body);
}
