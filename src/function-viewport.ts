import { compileMathExpression } from "octos-lesson-language";

export interface NumericRange { min: number; max: number }
export interface ViewportParameter { name: string; initial: number; min: number; max: number }

function niceRange(values: number[], includeZero = true): NumericRange {
  const finite = values.filter(v => Number.isFinite(v) && Math.abs(v) < 1e12).sort((a,b) => a-b);
  if (!finite.length) throw new Error("function has no finite teaching viewport");
  let low = finite[Math.floor((finite.length-1)*.02)]!;
  let high = finite[Math.ceil((finite.length-1)*.98)]!;
  if (includeZero) { low = Math.min(low, 0); high = Math.max(high, 0); }
  const span = high-low;
  const pad = span > 1e-9 ? span*.12 : Math.max(1, Math.abs(low)*.2);
  const rawStep = (span+2*pad)/6;
  const unit = 10**Math.floor(Math.log10(rawStep));
  const step = [1,2,5,10].map(n=>n*unit).find(n=>n>=rawStep)!;
  return {min: Math.floor((low-pad)/step)*step, max: Math.ceil((high+pad)/step)*step};
}

/** Bounded numerical recognition; verified at extra points before using a vertex. */
function quadratic(evaluate: (x:number)=>number): {vertex:number; value:number; a:number} | undefined {
  const y0=evaluate(0), y1=evaluate(1), ym=evaluate(-1);
  const a=(y1+ym-2*y0)/2, b=(y1-ym)/2;
  if (![a,b,y0].every(Number.isFinite) || Math.abs(a)<1e-9) return;
  for (const x of [-2, .37, 2, 3]) {
    const expected=a*x*x+b*x+y0, actual=evaluate(x);
    if (!Number.isFinite(actual) || Math.abs(expected-actual)>1e-8*Math.max(1,Math.abs(expected))) return;
  }
  const vertex=-b/(2*a), value=evaluate(vertex);
  if (Number.isFinite(vertex) && Number.isFinite(value)) return {vertex,value,a};
}

/** Viewport policy is entirely program-owned: no model fields or calls. */
export function functionViewport(expressions: string[], parameters: ViewportParameter[], requestedX?: NumericRange): {x:NumericRange;y:NumericRange} {
  const evaluators=expressions.map(e=>compileMathExpression(e,['x',...parameters.map(p=>p.name)]));
  const initial=Object.fromEntries(parameters.map(p=>[p.name,p.initial]));
  // Linear in parameter count; never sample the Cartesian product of extremes.
  const states=[initial,...parameters.flatMap(p=>[p.min,p.max].map(v=>({...initial,[p.name]:v})))];
  const evaluate=(index:number,state:Record<string,number>,x:number):number=>{
    try { return evaluators[index]!({...state,x}); } catch { return NaN; }
  };
  const vertices=states.flatMap(state=>evaluators.flatMap((_,i)=>{
    const q=quadratic(x=>evaluate(i,state,x));return q?[q]:[];
  }));
  // An identity reference indicates inverse/symmetry comparison. A shared local
  // range keeps the exponential tail from flattening its logarithmic inverse.
  const identity=expressions.some(e => e.replace(/[()\s]/g, "") === "x");
  if (!requestedX && identity && expressions.length > 1 && expressions.some(e => /\b(?:ln|log)\s*\(/.test(e))) {
    return {x:{min:-2,max:6},y:{min:-2,max:6}};
  }
  // Recognize a positive exponential from log-linear samples, then show the
  // transition around y=1 instead of letting the far tail dominate the view.
  if (!requestedX && expressions.length === 1 && parameters.length === 0) {
    const y0=evaluate(0,initial,0), y1=evaluate(0,initial,1);
    const rate=Math.log(y1/y0), intercept=Math.log(y0);
    if (y0>0 && y1>0 && Number.isFinite(rate) && Math.abs(rate)>1e-6
      && [-2,-1,.37,2,3].every(t => {
        const expected=Math.exp(intercept+rate*t),actual=evaluate(0,initial,t);
        return Number.isFinite(actual) && Math.abs(actual-expected)<1e-8*Math.max(1,expected);
      })) {
      const center=-intercept/rate, radius=2/Math.abs(rate);
      return {x:{min:Math.min(0,center-radius),max:Math.max(0,center+radius)},y:{min:-1,max:8}};
    }
  }
  let x=requestedX ?? {min:-4,max:4};
  if (!requestedX && vertices.length) {
    x={min:Math.min(-4,...vertices.map(q=>q.vertex-2)),max:Math.max(4,...vertices.map(q=>q.vertex+2))};
  } else if (!requestedX && expressions.some(e=>/\b(sin|cos|tan)\s*\(/.test(e))) {
    x={min:-Math.PI*2,max:Math.PI*2};
  }
  const sample=(range:NumericRange)=>Array.from({length:121},(_,i)=>range.min+(range.max-range.min)*i/120)
    .flatMap(t=>evaluators.map((_,index)=>evaluate(index,initial,t)));
  let values=sample(x);
  if (!requestedX && !vertices.length && values.filter(Number.isFinite).length<values.length*.7) {
    const positive={min:0,max:8}, alternative=sample(positive);
    if (alternative.filter(Number.isFinite).length>values.filter(Number.isFinite).length) {x=positive;values=alternative;}
  }
  // Quadratic lessons need the vertex and its local shape, not every distant tail
  // at every slider extreme. The stable x window includes the reachable vertices.
  if (vertices.length===states.length*evaluators.length) {
    values=vertices.flatMap(q=>[q.value,q.value+q.a*9]);
  }
  const y=expressions.length===1 && /^tan\(x\)$/.test(expressions[0].replace(/\s/g,""))
    ? {min:-4,max:4} : niceRange(values);
  for(const q of vertices) { y.min=Math.min(y.min,q.value-1);y.max=Math.max(y.max,q.value+1); }
  return {x,y};
}
