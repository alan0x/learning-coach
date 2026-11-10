import json,sys,statistics as st,collections
d=json.load(open(sys.argv[1]))
rows=[r for r in d['rows'] if r.get('http_status')==200]
A=[r for r in rows if r['variant']=='A']; B=[r for r in rows if r['variant']=='B']
amap={'math':{'math'},'physics':{'physics'},'general_science':{'chemistry','biology'},'language_humanities':set(),'other':set()}
def okA(r):
    c=r['answers']['subject']['choice']; exp=set(r['expected_plugins']); acc=exp|set(r['acceptable_plugins'])
    if not exp: return c in ('other','language_humanities') or bool(amap[c]&acc)
    return bool(amap[c]&exp)
def okB(r):
    c=r['answers']['subject']['choice']; exp=set(r['expected_plugins']); acc=exp|set(r['acceptable_plugins'])
    return c in acc if exp else (c=='unclear' or c in acc)
def by_cat(rs,f):
    out=collections.defaultdict(lambda:[0,0])
    for r in rs: out[r['category']][0]+=f(r); out[r['category']][1]+=1
    return {k:f"{a}/{b}" for k,(a,b) in sorted(out.items())}
print("calls ok:",len(rows),"of",len(d['rows']))
print("A top-1 subject correct:",sum(map(okA,A)),"/",len(A),by_cat(A,okA))
print("B top-1 subject correct:",sum(map(okB,B)),"/",len(B),by_cat(B,okB))
lat=[r['latency_ms'] for r in rows]; print("latency ms p50",st.median(lat),"p95",sorted(lat)[int(.95*len(lat))-1],"max",max(lat))
# disposition
def disp(r): return r['answers']['disposition']['choice']
dis=[(r['id'],r['expected_disposition'],disp(r)) for r in B]
print("disposition matches (B):",sum(e==g for _,e,g in dis),"/",len(dis),"mismatches:",[(i,e,g) for i,e,g in dis if e!=g])
# routing simulation for B
print("\nB routing simulation (selected = top if p>=T1, plus second if p>=T2; else broad):")
for T1 in (0.5,0.6,0.7,0.8):
  for T2 in (0.05,0.1,0.2,0.3):
    stats=collections.Counter(); misses=[]
    for r in B:
        if disp(r)!='generate_lesson': stats['not a lesson']+=1; continue
        p=r['answers']['subject']['probabilities']; ranked=sorted(((v,k) for k,v in p.items() if k!='unclear'),reverse=True)
        top=ranked[0]; sel=set()
        if top[0]>=T1 and p.get('unclear',0)<top[0]:
            sel={top[1]}
            if ranked[1][0]>=T2: sel.add(ranked[1][1])
        exp=set(r['expected_plugins']); acc=exp|set(r['acceptable_plugins'])
        if not sel: stats['broad']+=1
        elif exp<=sel and sel<=acc: stats['scoped, correct']+=1
        elif exp<=sel: stats['scoped, correct + extra']+=1
        else: stats['scoped, missing a needed plugin -> reroute']+=1; misses.append(r['id'])
    print(f" T1={T1} T2={T2}:",dict(stats),"reroute cases:",misses)
# mixed coverage
print("\nmixed cases (B) probabilities:")
for r in B:
    if r['category']=='mixed': print(' ',r['id'],r['expected_plugins'],{k:round(v,2) for k,v in r['answers']['subject']['probabilities'].items() if v>=0.05})
print("\nB wrong top-1:",[(r['id'],r['expected_plugins'],r['answers']['subject']['choice'],round(r['answers']['subject']['confidence'],2)) for r in B if not okB(r)])
print("A wrong top-1:",[(r['id'],r['expected_plugins'],r['answers']['subject']['choice']) for r in A if not okA(r)])
