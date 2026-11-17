# Paired probe: plot points as the model means them (2026-11-16)

Decision 0020 and the 0018 amendment (Coach #113). The owner approved a cap of 120 calls, the one-call schema
check included, and asked for this probe before any speed gate.

- **Candidate:** #113 frozen at `76684ed`, after two code reviews.
- **Control:** main `90c2377`.

## Pass rules (set before the run)

1. No lesson lost or misleading where the control was fine.
2. Every point the narration describes is drawn (read by hand: the judge does not check it).
3. The new y check refuses less often than the slip it replaces; otherwise y becomes optional.

## Results

- **Schema check (2 calls):** the provider accepted `points`. PJ-01 published with two fixed points, (1, 1) and (3, 7), and passed the judge.
- **Probe (78 calls):** PJ-01, -02, -04, -05, -07, -10 and -17, two new dragged-point cases (DP-01, DP-02) and HO-PH-04, each twice per arm, 40 lessons in all.

| | Control | Candidate |
|---|---|---|
| Lessons playable | 18 of 20 | 19 of 20 |
| Calls | 39 | 39 |
| Plot judge passes | 12 of 13 judged | 11 of 14 judged |
| Refusals: old sample slip / new point check | 7 / – | – / 1 |

- **Lost on the control:** HO-PH-04 and PJ-10, one repeat each. Both were the old slip, repeated on every attempt. The candidate published both cases.
- **Lost on the candidate: PJ-04, one repeat. Rule 1 failed here, and the cause was in #113.**
  - The model gave the vertex's x its own slider ("顶点横坐标") and wrote a dragged point on that slider, on (x − n1)² + 2.
  - #113 refused a dragged point on a curve the sliders change. The model alternated between that refusal and another until the attempts ran out.
  - Main leaves such a point to the curve, and the moving vertex mark shows the vertex.
  - **Fixed after the probe:** the refusal is removed, and such a point is handled as main handles it. Replaying the same replies on the fix, PJ-04 publishes on its second call and passes the judge, and all 20 candidate replays publish.
- **Judge misses on the candidate:** PJ-10 in both repeats, and they are not caused by #113.
  - Neither lesson used points.
  - Both replay with the same misses on main: one asked only for the domain (a model choice), the other is the judge's known false positive at a boundary.
- **Rule 2, read by hand: pass.** Every point the narration describes is drawn: PJ-01's (1, 1) and (3, 7), PJ-02's intercepts, PJ-05's and PJ-17's vertices, and P in DP-01 and DP-02.
  - **Cosmetic:** a fixed point on the vertex is drawn on top of the vertex mark.
  - **Truncated labels:** labels were cut at 8 characters ("P(x, sqr"). Labels up to 16 characters are now kept whole; a longer one falls back to the program's letter.
- **Rule 3: pass.** The point check refused once, against 7 refusals for the old slip on the control.

**What this does not measure:** the two fixes made after the run (the guard and the labels) were checked offline on the same replies, not in a new live run.

## Tokens and cost

**Tokens,** over 53 recorded replies:
- prompt 136,864 (41,997 of them cached);
- output 67,258;
- thinking 12,700.

**Cost estimate:** about $0.37 for the recorded replies, and about $0.55 scaled to the run's 78 calls; with the schema check, about $0.57. Prices are gemini-3.6-flash's standard ones (Google's pricing page, read 2026-11-15).

## Speed gate (owner-approved 2026-11-16, cap 160 calls)

The owner accepted the offline check of the post-probe fix and approved the gate.

### Setup

- **Builds:** candidate `f5a83ba`; control main `90c2377`. Both run in the same environment (`--baseline-build`).
- **Command:** `--recipes extensions_switch_on --pairs 40 --lesson-calls 4 --max-calls 160`. This is the request set of the 2026-11-15 gate, unchanged, so the two gates can be compared:
  - ST-01 to ST-05;
  - PJ-01, -02, -04, -07 and -10;
  - the ten routing cases.
- **Data:** `handoff-math-expressiveness/runs/plot-points-gate/`.

### Result: pass

| | Control | Candidate |
|---|---|---|
| Median time to first playable | 8.8 s | 9.2 s |
| Playable | 39 of 40 | 40 of 40 |
| Refusals | 9 (6 of them the old sample slip) | 2 |

- **Paired difference (candidate minus control):** median +107 ms, 95% interval −1.8 s to +1.3 s, over 39 complete pairs.
- **The gate's verdict:**
  - requests that fit the new parts: −185 ms;
  - other requests: +348 ms;
  - no slowdown beyond the gate's limits.
- **The lesson the control lost:** PJ-01 in one repeat, to the old slip on every attempt.
- **Request size:** median prompt 2,929 tokens, against 2,900 on the control.

### Calls

- **Started calls:** 111 in all (control 50, candidate 61).
- **The extra candidate calls are not refusals.** On a lesson with no refusal, the candidate arm often counts a second call that was started but never completed: the next section's request begins before the harness stops at the first playable part.
- **This is a harness effect, not #113:**
  - the 2026-11-15 gate showed the same pattern in its candidate arm (14 of 31 clean lessons, against 2 of 33 on its control);
  - this gate shows 18 of 39, against 1 of 34;
  - only 91 replies were recorded.
- **Follow-up:** count completed calls in the harness, or stop before the next request starts.

### Tokens and cost

**Tokens,** over 91 recorded replies:
- prompt 250,703 (97,915 of them cached);
- output 107,494;
- thinking 36,996.

**Cost estimate:** about $0.66. Prices are gemini-3.6-flash's standard ones (Google's pricing page, read 2026-11-15).
- The 20 calls that were started but stopped may also bill their input: at most about $0.05 more.
- The day's three runs (schema check, probe, gate) cost about $1.25 in all.
