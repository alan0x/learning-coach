import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { completeLessonPlanFixtures } from './lesson-plan-course-fixtures.mjs';
const bundle=await build({entryPoints:['src/lesson-plan-api.ts'],bundle:true,platform:'node',format:'esm',target:'node20',write:false,logLevel:'silent'});
const {compileLessonPlan,generateLessonPlanWithModel}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

test('English output rules reach the first model call with no translation round trip',async()=>{
 let request, calls=0;
 await assert.rejects(generateLessonPlanWithModel(async next=>{request=next;calls++;throw new Error('capture');},
 {turn_id:'english',learner_request:'请讲解一次函数',language:'en-US'},{max_attempts_per_part:1}));
 assert.equal(calls,1);
 assert.match(request.system_prompt,/Output language: English/);
 assert.match(request.system_prompt,/Teacher profiles.*do not override/);
 assert.equal(JSON.parse(request.prompt).course_context.language,'en-US');
});

test('English compilation preserves all numerical operations and authored content',()=>{
 for(const [name,fixture] of Object.entries(completeLessonPlanFixtures)){
  const plan=typeof fixture==='function'?fixture():structuredClone(fixture);
  const zh=compileLessonPlan(plan,{language:'zh-CN'}).lesson;
  const en=compileLessonPlan(plan,{language:'en-US'}).lesson;
  assert.equal(en.lesson.language,'en-US',name);
  assert.equal(en.lesson.title,zh.lesson.title,name);
  assert.deepEqual(en.lesson.variables,zh.lesson.variables,name);
  const structure=value=>{
   if(Array.isArray(value))return value.map(structure);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['title','label','caption','fallback','prompt','hints','success_message','intent','language','say'].includes(key)).map(([key,item])=>[key,structure(item)]));
   return value;
  };
  assert.deepEqual(structure(en),structure(zh),name);
 }
});

test('unsupported camera-independent requests use the lesson language without a model call',async()=>{
 const result=await generateLessonPlanWithModel(()=>{throw new Error('must not call');},{turn_id:'4d',learner_request:'精确模拟四维超立方体的四维旋转',language:'en-US'});
 assert.equal(result.model_calls,0);
 assert.match(result.learner_response,/4D hypercube/);
 assert.doesNotMatch(result.learner_response,/[\p{Script=Han}]/u);
});
