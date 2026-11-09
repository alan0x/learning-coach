import json, sys, statistics as st, collections, glob, os

d = json.load(open(sys.argv[1]))
lessons_dir = os.path.join(os.path.dirname(sys.argv[1]), 'lessons')
rows = d['rows']

def pct(values, q):
    v = sorted(values)
    if not v: return None
    k = (len(v) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo))

def summary(values):
    return {'n': len(values), 'p50': pct(values, .5), 'p95': pct(values, .95), 'max': max(values) if values else None}

print('owner', d.get('owner'), 'model', d.get('lesson_model'), 'samples', len(rows))
outcome = collections.Counter((r.get('disposition') or r.get('failed') or ('error: ' + r['error'] if r.get('error') else 'unknown')) for r in rows)
print('outcomes', dict(outcome))

lessons = [r for r in rows if r.get('disposition') == 'lesson']
fp = [r['first_playable_ms'] for r in lessons if r.get('first_playable_ms') is not None]
print('first playable (lessons)', summary(fp))
for src in ('self_contained', 'current_image', 'ink_selection'):
    v = [r['first_playable_ms'] for r in lessons if r['request_source'] == src and r.get('first_playable_ms') is not None]
    if v: print('  ', src, summary(v))
by_cat = collections.defaultdict(list)
for r in lessons:
    if r.get('first_playable_ms') is not None: by_cat[r['category']].append(r['first_playable_ms'])
print('first playable by category', {k: summary(v) for k, v in sorted(by_cat.items())})
print('total generation (lessons)', summary([r['generation_elapsed_ms'] for r in lessons if r.get('generation_elapsed_ms')]))

def expected_calls(r):
    return 1 + max(0, (r.get('sections') or 1) - 1) + (1 if (r.get('sections') == 1) else 0)
extra = [r for r in lessons if (r.get('total_model_calls') or 0) > expected_calls(r)]
print('lessons with extra model calls (retries/fallback)', len(extra), 'of', len(lessons), [(r['id'], r['rep'], r.get('total_model_calls'), r.get('sections')) for r in extra])
fallback = [r for r in rows if any(c['label'] == 'lesson-plan-outline' for c in r.get('model_calls', []))]
print('first request fell back to outline-only call', len(fallback), [(r['id'], r['rep']) for r in fallback])
rej = [r for r in rows if r.get('local_rejections')]
print('samples with local rejections', len(rej), sum(r['local_rejections'] for r in rej))
first_section_repaired = [r for r in rows if any(c['label'] == 'lesson-plan-section' and c.get('section') == 1 and c.get('part') == 'section' for c in r.get('model_calls', []))]
print('first section rewritten after combined request', len(first_section_repaired), [(r['id'], r['rep']) for r in first_section_repaired])

boot = [c for r in rows for c in r.get('model_calls', []) if c['label'] == 'lesson-plan-bootstrap' and c['status'] == 'completed']
print('first request: prompt_tokens', summary([c['prompt_tokens'] for c in boot if c.get('prompt_tokens')]),
      'cached_content_tokens', summary([c.get('cached_content_tokens') or 0 for c in boot]),
      'request_bytes', summary([c['request_bytes'] for c in boot if c.get('request_bytes')]),
      'model time ms', summary([c['elapsed_ms'] for c in boot if c.get('elapsed_ms')]),
      'output tokens', summary([c['candidate_tokens'] for c in boot if c.get('candidate_tokens')]))
ratio = [c['prompt_tokens'] / (c['system_prompt_bytes'] + c['prompt_bytes']) for c in boot if c.get('prompt_tokens') and c.get('system_prompt_bytes')]
ratio_all = [c['prompt_tokens'] / c['request_bytes'] for c in boot if c.get('prompt_tokens') and c.get('request_bytes')]
print('prompt_tokens per byte: excluding schema', round(st.median(ratio), 3) if ratio else None, '| including schema', round(st.median(ratio_all), 3) if ratio_all else None)

# Visuals used, from the final lesson files.
caps = collections.defaultdict(collections.Counter)
for r in lessons:
    files = glob.glob(os.path.join(lessons_dir, f"{r['id']}-r{r['rep']}-.octos-lesson.json"))
    if not files: continue
    lesson = json.load(open(files[0]))
    kinds = collections.Counter()
    for step in lesson.get('steps', []):
        for beat in step.get('beats', []):
            for action in beat.get('actions', []):
                if action.get('do') == 'write': kinds[action.get('kind')] += 1
    caps[r['category']].update(kinds)
print('board kinds written per category', {k: dict(v.most_common()) for k, v in sorted(caps.items())})
nonlesson = [(r['id'], r['rep'], r.get('disposition') or r.get('failed') or r.get('error')) for r in rows if r.get('disposition') != 'lesson']
print('not a lesson', nonlesson)

reps = collections.defaultdict(list)
for r in lessons:
    if r.get('first_playable_ms') is not None: reps[r['id']].append(r['first_playable_ms'])
pairs = [v for v in reps.values() if len(v) == 2]
if pairs: print('repeat pairs', len(pairs), 'median |difference| ms', round(st.median(abs(a - b) for a, b in pairs)))
