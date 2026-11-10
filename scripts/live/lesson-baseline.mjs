// Live lesson baseline through the local Octos (127.0.0.1:50080) with the
// signed-in owner's own model configuration. Sends the same skill action and
// arguments as Octos Learn, waits for the job, and reads Coach's generation
// trace. No teacher profile or learner background is attached, so every
// sample is comparable; speech is not synthesized.
// Usage: node lesson-baseline.mjs OUT_DIR MAX_SAMPLES IMAGES_DIR (render images with render-images.mjs)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { connect, login } from './ws-client.mjs';

const [OUT, MAX = '120', IMAGES_DIR] = process.argv.slice(2);
const IMAGES = (IMAGES_DIR ?? `${OUT}/images`).replace(/\/?$/, '/');
const coach = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const suite = JSON.parse(await readFile(`${coach}/eval/subject-routing-cases.json`, 'utf8'));
const math = JSON.parse(await readFile(`${coach}/testsuite/math-natural-course-cases.json`, 'utf8'));
const mathById = new Map(math.cases.map((c) => [c.id, c]));
const cases = [
  ...suite.math_cases_by_reference.ids.map((id) => ({ id, category: 'math', language: 'zh-CN', prompt: mathById.get(id).prompt, expected_plugins: ['math'] })),
  ...suite.cases,
];
const REPEATS = ['M01-linear-system-question', 'M01-linear-system-topic', 'M02-quadratic-translation-question', 'M02-quadratic-translation-topic',
  'M03-exp-log-inverse-question', 'M03-exp-log-inverse-topic', 'M04-unit-circle-sine-question', 'M04-unit-circle-sine-topic',
  'M05-pythagorean-rearrangement-question', 'M05-pythagorean-rearrangement-topic', 'PH-en-01', 'PH-en-02', 'PH-en-03', 'PH-en-04', 'PH-en-05', 'PH-en-06',
  'CH-en-01', 'CH-en-02', 'CH-en-03', 'CH-en-04', 'BI-en-01', 'BI-en-02', 'BI-en-03', 'BI-en-04', 'MX-en-01', 'MX-en-02', 'MX-en-03'];
const samples = [...cases.map((c) => ({ ...c, rep: 1 })), ...REPEATS.map((id) => ({ ...cases.find((c) => c.id === id), rep: 2 }))]
  .slice(0, Number(MAX));

await mkdir(`${OUT}/lessons`, { recursive: true });
const resultPath = `${OUT}/lesson-baseline.json`;
const report = existsSync(resultPath) ? JSON.parse(await readFile(resultPath, 'utf8')) : { started_at: new Date().toISOString(), rows: [] };
const done = new Set(report.rows.map((r) => `${r.id}#${r.rep}`));
const { token, owner, model } = await login();
report.owner = owner; report.lesson_model = model;
const auth = { Authorization: `Bearer ${token}` };
const save = () => writeFile(resultPath, JSON.stringify(report, null, 2));

async function upload(file) {
  const form = new FormData();
  form.append('audio_upload_mode', 'upload');
  form.append('file', new Blob([await readFile(file)], { type: 'image/png' }), 'capture.png');
  const response = await fetch('http://127.0.0.1:50080/api/upload', { method: 'POST', headers: auth, body: form });
  if (!response.ok) throw new Error(`upload ${response.status}`);
  return response.json();
}

function parseTrace(text, submittedAt) {
  const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const started = new Map();
  const calls = [];
  const out = { model_calls: [], local_rejections: 0 };
  for (const item of lines) {
    if (item.stage === 'model-call' && item.status === 'started') started.set(`${item.label}|${item.lesson_plan_part}|${item.lesson_plan_attempt}|${calls.length}`, item);
    if (item.stage === 'model-call' && ['completed', 'failed'].includes(item.status)) {
      const start = [...started.values()].find((s) => s.label === item.label && s.lesson_plan_part === item.lesson_plan_part && !s.used);
      if (start) start.used = true;
      calls.push(item);
      out.model_calls.push({ label: item.label, part: item.lesson_plan_part, section: item.lesson_plan_section, attempt: item.lesson_plan_attempt,
        status: item.status, finish_reason: item.finish_reason, request_attempts: item.request_attempts, elapsed_ms: item.elapsed_ms,
        prompt_tokens: item.prompt_tokens, cached_content_tokens: item.cached_content_tokens, candidate_tokens: item.candidate_tokens, thought_tokens: item.thought_tokens,
        schema_bytes: start?.schema_bytes, system_prompt_bytes: start?.system_prompt_bytes, prompt_bytes: start?.prompt_bytes, request_bytes: start?.request_bytes });
    }
    if (item.stage === 'lesson-client-timing') out.skill_process_started_at = item.skill_process_started_at_epoch_ms;
    if (item.stage === 'lesson-prefix-published' && item.completed_sections === 1 && out.first_prefix_elapsed_ms === undefined) out.first_prefix_elapsed_ms = item.elapsed_ms;
    if (item.stage === 'lesson-plan-outline-ready') out.outline_ready_ms = item.elapsed_ms;
    if (item.stage === 'lesson-plan-local-rejection') out.local_rejections += 1;
    if (item.stage === 'lesson-plan-generation' && item.status === 'completed') Object.assign(out, { disposition: item.disposition ?? 'lesson', sections: item.sections, total_model_calls: item.model_calls, generation_elapsed_ms: item.elapsed_ms });
    if (item.stage === 'lesson-generation' && item.status === 'failed') Object.assign(out, { failed: item.error_code });
  }
  if (out.skill_process_started_at && out.first_prefix_elapsed_ms !== undefined) {
    out.queue_ms = out.skill_process_started_at - submittedAt;
    out.first_playable_ms = out.queue_ms + out.first_prefix_elapsed_ms;
  }
  return out;
}

let client = null;
for (const sample of samples) {
  if (done.has(`${sample.id}#${sample.rep}`)) continue;
  client ??= await connect(token, owner);
  const row = { id: sample.id, rep: sample.rep, category: sample.category, language: sample.language, request_source: sample.request_source ?? 'self_contained' };
  try {
    const sessionId = `learn-${Date.now()}-bl${report.rows.length + 1}`;
    await client.rpc('session/open', { session_id: sessionId });
    const paths = sample.image ? await upload(`${IMAGES}${sample.id}.png`) : [];
    const actionId = sample.request_source === 'current_image' ? 'learning.lesson.generate-from-camera'
      : sample.request_source === 'ink_selection' ? 'learning.lesson.generate-from-selection' : 'learning.lesson.generate';
    const turnId = randomUUID();
    const submittedAt = Date.now();
    const invocation = await client.rpc('skill/action/invoke', { session_id: sessionId, action_id: actionId, arguments: {
      ...(paths.length ? { paths } : {}), turn_id: turnId, learner_request: sample.prompt,
      request_source: sample.request_source === 'ink_selection' ? 'ink_selection' : sample.request_source ?? 'self_contained',
      language: sample.language, ...(sample.current_lesson ? { current_lesson: sample.current_lesson } : {}),
      input_modality: 'text', client_timing: { submitted_at_epoch_ms: submittedAt, skill_invocation_started_at_epoch_ms: submittedAt },
    } }, 60000);
    Object.assign(row, { session_id: sessionId, turn_id: turnId, invoke_ok: invocation?.ok !== false });
    const deadline = Date.now() + 420000;
    let jobs = [];
    while (Date.now() < deadline) {
      ({ jobs = [] } = await client.rpc('skill/action/job/list', { session_id: sessionId }));
      const own = jobs.filter((j) => j.action_id === actionId);
      if (own.length && own.every((j) => !['queued', 'running'].includes(j.status))) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    row.job_status = jobs.map((j) => j.status).join(',');
    row.wall_ms = Date.now() - submittedAt;
    const { files = [] } = await client.rpc('session/files.list', { session_id: sessionId });
    for (const file of files.filter((f) => f.filename.startsWith(turnId))) {
      const response = await fetch(`http://127.0.0.1:50080/api/files?${new URLSearchParams({ path: file.path, session: sessionId })}`, { headers: auth });
      const text = await response.text();
      if (file.filename.endsWith('.generation-trace.jsonl')) Object.assign(row, parseTrace(text, submittedAt));
      if (file.filename.endsWith('.octos-lesson.json')) await writeFile(`${OUT}/lessons/${sample.id}-r${sample.rep}-${file.filename.replace(turnId, '')}`, text);
    }
    row.files = files.filter((f) => f.filename.startsWith(turnId)).map((f) => f.filename.replace(turnId, ''));
  } catch (error) {
    row.error = error.message;
    try { client?.close(); } catch {}
    client = null;
  }
  report.rows.push(row);
  await save();
  console.log(`${report.rows.length}/${samples.length} ${row.id}#${row.rep} ${row.disposition ?? row.failed ?? row.error ?? '?'} first_playable=${row.first_playable_ms ?? '-'}ms calls=${row.total_model_calls ?? row.model_calls?.length ?? '-'}`);
}
report.completed_at = new Date().toISOString();
await save();
client?.close();
