# Payload experiment: +8 KB in the first request (2026-11-11)

Subject plan P2, step 2 (Octos Learn `docs/SUBJECT_EXPANSION_PLAN.md`). The owner scaled the experiment down and approved it on 2026-11-10: 8 KB only, first playable only, 20 pairs (40 if borderline), with a hard stop at 60 model calls.

## Question

Does a larger first request delay the first playable section? The answer sets the ceilings' headroom (decision S14) and decides whether scoped requests are built now.

## Method

- **Harness:** `scripts/eval-payload-padding.mjs`. Each run uses Coach's lesson generator and the production model client, with the same input and options as a typed composer request in `main.ts`. A run stops once the first section is playable, so it covers the opening request and any repair before it.
- **Route:** the owner's `yy` profile, Gemini API, `gemini-3.6-flash`, thinking LOW. The harness read the route inside its own process (`--octos-profile`); no key appears in any output, as checked by a fragment scan.
- **Padding:** about 5.4 KB of recipe cards for other subjects' tools in the system prompt, marked unavailable, plus about 3.0 KB of schema description: +8,368 B in total. The schema's choices are unchanged. The request grew from 17.4 KB to 25.8 KB.
- **Design:** 20 pairs over the 15 cases in `eval/lesson-plan-generation-cases.json`. Padded and unpadded runs alternate, and the order within a pair alternates.
- **Raw report:** `eval/payload-padding-8k-2026-11-11.json`.

## Result

| | Unpadded | Padded |
|---|---|---|
| Prompt tokens (provider, median) | 2,514 | 3,845 (+1,331) |
| Output tokens (median) | 1,457 | 1,497 |
| First playable p50 | 8.85 s | 8.87 s |
| Opening request p50 | 8.68 s | 8.86 s |
| Model calls before first playable | 23 | 21 |

Paired differences (padded − unpadded):
- **Opening request:** median +0.52 s, mean +0.17 s, 95% CI −0.95 to +1.29 s. The padded run was slower in 12 of 20 pairs.
- **First playable, the 18 pairs without a repair call:** mean +0.08 s, 95% CI −1.16 to +1.32 s.

No slowdown was detected. The noise between runs (SD of paired differences ≈ 2.5 s) means a slowdown above about 1.3 s is ruled out, but a smaller one is not. The owner accepted this result on 2026-11-11 instead of extending to 40 pairs. The extra input is small next to the roughly 1,500 output tokens, which dominate the call.

**Cost:** 56 model calls started (45 completed), about USD 0.30, estimated from the October benchmark's per-call cost. The harness does not meter spend. The first run reused one model router across runs. That router's 270 s total time budget belongs to a single lesson, so it ran out after 14 pairs and cancelled 11 calls at start. The harness now creates a router per run, as `main.ts` does, and the remaining 6 pairs were rerun.

## Consequences

- **Scoped requests stay deferred.** Request size up to +8 KB showed no measurable cost, so the §5.3 trigger has not fired.
- **Ceilings (`eval/payload-ceilings.json`):**
  - Every first-request ceiling is its P0 maximum plus the tested +8,368 B (schema +2,956 B). Other paths keep their P0 maxima because the experiment did not test them.
  - The text first request's provider prompt-token ceiling is 3,875, checked in live runs.
- **Plugin budgets (S14), as a proposed allocation of 8,000 B of the headroom:**
  - Each budget is the plugin's current footprint plus its share.
  - Shares: shared and physics get 2,000 B each, because the next recipes (constant-speed motion, vectors, free-layout diagrams) go there. Math, chemistry, biology and earth_space get 1,000 B each.
  - `test/payload-ceilings.test.mjs` fails when a plugin exceeds its budget.
