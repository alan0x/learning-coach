/**
 * M1 coverage summary for the math expressiveness question set (Learn docs/MATH_EXPRESSIVENESS_PLAN.md §4).
 * The ranking of candidates uses the open questions only; held-out questions are a check that it holds.
 */
export const BANDS = ["K-2", "3-5", "6-8", "9-12"];

function tally(questions, tags) {
  const out = { n: questions.length, fully_by_component: 0, fully_by_board: 0, partly: 0, extend: 0, new: 0 };
  for (const q of questions) {
    const tag = tags[q.id];
    if (tag.coverage === "fully") out[tag.component === "board" ? "fully_by_board" : "fully_by_component"] += 1;
    else out[tag.coverage] += 1;
  }
  return out;
}

function byBand(questions, tags) {
  return Object.fromEntries([...BANDS, "all"].map((band) => [band, tally(questions.filter((q) => band === "all" || q.band === band), tags)]));
}

export function summarize(questions, tags) {
  const open = questions.filter((q) => !q.held_out);
  const held = questions.filter((q) => q.held_out);
  const needsPicture = questions.filter((q) => q.picture_kind !== "none");
  const gains = (set) => {
    const out = {};
    for (const q of set) {
      const candidate = tags[q.id].completes_with;
      if (!candidate) continue;
      out[candidate] ??= { total: 0, from_not: 0, from_partly: 0, ...Object.fromEntries(BANDS.map((b) => [b, 0])) };
      out[candidate].total += 1;
      out[candidate][q.band] += 1;
      out[candidate][tags[q.id].coverage === "partly" ? "from_partly" : "from_not"] += 1;
    }
    return out;
  };
  const openGains = gains(open);
  const heldGains = gains(held);
  const ranking = Object.entries(openGains)
    .sort(([a, x], [b, y]) => y.total - x.total || y.from_not - x.from_not || a.localeCompare(b))
    .map(([candidate, g]) => ({ candidate, open: g, held_out: heldGains[candidate]?.total ?? 0 }));
  return {
    all: byBand(questions, tags),
    needs_a_picture: byBand(needsPicture, tags),
    without_natural_set: byBand(questions.filter((q) => q.source !== "natural-set"), tags),
    open: byBand(open, tags),
    held_out: byBand(held, tags),
    candidates_by_open_gain: ranking,
  };
}
