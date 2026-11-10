// Minimal JSON-RPC client for the local Octos UI protocol (same frames Octos Learn sends).
export async function connect(token, owner) {
  const url = new URL('ws://127.0.0.1:50080/api/ui-protocol/ws'); url.searchParams.set('token', token);
  for (const f of ['skill.actions.v1', 'skill.action_jobs.v1', 'auxiliary.rest_to_ws.v1']) url.searchParams.append('ui_feature', f);
  const socket = new WebSocket(url); let seq = 0; const pending = new Map();
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = () => fail(new Error('ws connect failed')); });
  socket.onmessage = (e) => { let r; try { r = JSON.parse(e.data); } catch { return; } const p = r.id && pending.get(r.id); if (!p) return; pending.delete(r.id); clearTimeout(p.t); r.error ? p.fail(Object.assign(new Error(r.error.message ?? 'rpc error'), { rpc: r.error })) : p.ok(r.result); };
  const rpc = (method, params, timeoutMs = 30000) => new Promise((ok, fail) => {
    const id = `baseline-${++seq}`; const t = setTimeout(() => { pending.delete(id); fail(new Error(`${method} timeout`)); }, timeoutMs);
    pending.set(id, { ok, fail, t }); socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
  });
  return { rpc, close: () => socket.close() };
}
export async function login() {
  const solo = await (await fetch('http://127.0.0.1:50080/api/auth/solo', { method: 'POST' })).json();
  const prof = await (await fetch('http://127.0.0.1:50080/api/my/profile', { headers: { Authorization: `Bearer ${solo.token}` } })).json();
  const p = prof.profile?.profile ?? prof.profile ?? prof;
  return { token: solo.token, owner: p.id, model: p.config?.llm?.primary?.model_id };
}
