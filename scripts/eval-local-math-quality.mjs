#!/usr/bin/env node
// Read-only local service integration, apart from newly generated test sessions.
// Review targets remain in this evaluator and are never sent to the model.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const base=option('--base','http://127.0.0.1:50080');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) throw new Error('This evaluator only targets a local development service');
const output=resolve(option('--output','/tmp/octos-math-quality-eval'));
const repeats=Number(option('--repeat','1'));
if(!Number.isInteger(repeats)||repeats<1||repeats>20)throw new Error('repeat must be 1..20');
const suite=JSON.parse(await readFile(new URL('../testsuite/math-natural-course-cases.json',import.meta.url),'utf8'));
const selected=suite.cases.filter(c=>(!args.includes('--case')||c.id===option('--case'))&&(!args.includes('--variant')||c.variant===option('--variant')));
if(!selected.length)throw new Error('No cases matched');
await mkdir(output,{recursive:true});
const auth=await (await fetch(base+'/api/auth/solo',{method:'POST'})).json();
if(!auth.token)throw new Error('Local solo login unavailable');
const wsUrl=new URL(base+'/api/ui-protocol/ws');wsUrl.protocol=wsUrl.protocol==='https:'?'wss:':'ws:';wsUrl.searchParams.set('token',auth.token);
const ws=new WebSocket(wsUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(new Error('Local websocket unavailable'));});
let sequence=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=String(++sequence);const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},30000);pending.set(id,m=>{clearTimeout(timeout);m.error?reject(new Error(m.error.message)):resolve(m.result);});ws.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));});
try {
 for(const item of selected)for(let repeat=1;repeat<=repeats;repeat++){
  const id=`${item.id}-${repeat}`,destination=join(output,id+'.json');
  try{await readFile(destination);console.log('SKIP',id);continue;}catch{}
  const started=Date.now(),session=`web-math-eval-${started}`,turn=`math-eval-${started}`;
  await rpc('session/open',{session_id:session});
  const learnerRequest=item.fixed_context
    ? `题目上下文：${item.fixed_context}\n学习者追问：${item.prompt}`
    : item.prompt;
  const invocation=await rpc('skill/action/invoke',{session_id:session,action_id:'learning.lesson.generate',arguments:{turn_id:turn,learner_request:learnerRequest,request_source:'self_contained',language:'zh-CN',input_modality:'text'}});
  const jobId=invocation.jobs?.[0]?.job_id;
  if(!jobId)throw new Error('Lesson action did not enqueue a job');
  let terminal;
  while(Date.now()-started<300000){
   const status=await rpc('skill/action/job/list',{session_id:session});
   terminal=status.jobs?.find(j=>j.job_id===jobId&&['succeeded','failed','cancelled'].includes(j.status));
   if(terminal)break;
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!terminal)throw new Error('Job exceeded 300 seconds; stop before creating further sessions');
  const artifactCount=terminal.result?.artifacts?.length??0;
  const report={id,case:item,session,profile:terminal.profile_id,job_status:terminal.status,action_success:terminal.result?.success??false,artifact_count:artifactCount,lesson_generated:terminal.result?.success===true&&artifactCount>0,elapsed_ms:Date.now()-started,learner_response:terminal.result?.output??terminal.output,review_status:'pending'};
  if(/^[\w-]+$/.test(terminal.profile_id)){
   const work=join(option('--data-root',join(homedir(),'.octos')),'profiles',terminal.profile_id,'data','users',session,'workspace','skill-output','study','oll');
   try{
    const files=(await readdir(work)).filter(f=>f.startsWith(turn));const artifactDir=join(output,id);await mkdir(artifactDir,{recursive:true});
    for(const f of files)await copyFile(join(work,f),join(artifactDir,f));
    const trace=files.find(f=>f.endsWith('.generation-trace.jsonl'));
    if(trace){const events=(await readFile(join(work,trace),'utf8')).trim().split('\n').map(JSON.parse);const calls=events.filter(e=>e.stage==='model-call'&&e.status==='completed');report.metrics={first_playable_ms:events.find(e=>e.stage==='lesson-prefix-published')?.invocation_elapsed_ms??null,total_ms:events.findLast(e=>e.stage==='lesson-plan-generation'&&e.status==='completed')?.invocation_elapsed_ms??null,model_calls:calls.length,input_tokens:calls.map(e=>e.prompt_tokens??null),repairs:events.filter(e=>e.stage==='lesson-plan-local-rejection').length};}
   }catch(error){report.artifact_read_error=error.message;}
  }
  await writeFile(destination,JSON.stringify(report,null,2)+'\n');console.log(id,report.lesson_generated?'generated':'no lesson',JSON.stringify(report.metrics??{}));
 }
} finally {ws.close();}
