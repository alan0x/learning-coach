#!/usr/bin/env node
// Bytes are an offline guard, not a substitute for provider token/latency traces.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const baselinePath=process.argv[2];
if(!baselinePath)throw new Error('Usage: node scripts/check-math-prompt-budget.mjs /path/to/frozen/lesson-plan.mjs');
const baseline=await import(pathToFileURL(resolve(baselinePath)).href);
const candidate=await import(new URL('../lesson-plan.js',import.meta.url));
const suite=JSON.parse(await readFile(new URL('../testsuite/math-natural-course-cases.json',import.meta.url),'utf8'));
const rows=[];
for(const item of suite.cases){
 const requests=[];
 for(const api of [baseline,candidate]){
  let first;
  try{await api.generateLessonPlanWithModel(async request=>{first??=request;throw new Error('capture only');},{turn_id:'prompt-budget',learner_request:item.prompt,language:'zh-CN',input_modality:'text',...(item.fixed_context?{learner_context:item.fixed_context}:{})},{max_attempts_per_part:1});}catch{}
  if(!first){
   requests.push({system_bytes:0,prompt_bytes:0,schema_bytes:0,model_calls:0});
   continue;
  }
  requests.push({system_bytes:Buffer.byteLength(first.system_prompt),prompt_bytes:Buffer.byteLength(first.prompt),schema_bytes:Buffer.byteLength(JSON.stringify(first.response_schema)),model_calls:1});
 }
 const total=request=>Object.values(request).reduce((a,b)=>a+b,0);
 const row={id:item.id,baseline:requests[0],candidate:requests[1],delta_bytes:total(requests[1])-total(requests[0])};rows.push(row);
}
console.log(JSON.stringify({cases:rows.length,regressions:rows.filter(row=>row.delta_bytes>0),max_delta_bytes:Math.max(...rows.map(row=>row.delta_bytes))},null,2));
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(rows,null,2)+'\n');
if(rows.some(row=>row.delta_bytes>0))process.exitCode=1;
