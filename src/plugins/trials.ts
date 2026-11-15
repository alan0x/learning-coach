// Options on recipes already offered, built and tested but not yet offered themselves. A new option
// changes every provider request, as a new recipe does, so it is offered only after the speed gate
// (decision E5). Until then a measurement run names it in LEARNING_COACH_TRIAL_RECIPES, as it names a
// trial recipe. The function plot's extensions (OLL decision 0018: marks, then pieces, domain and range)
// are frozen and gated together, so they share one name.
export const TRIAL_OPTIONS = ["function_plot_extensions"] as const;
export type TrialOption = typeof TRIAL_OPTIONS[number];

const processEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/** Whether a comma-separated list (the environment's, by default) names the trial option. */
export function trialOptionEnabled(name: TrialOption, list: string | undefined = processEnvironment?.LEARNING_COACH_TRIAL_RECIPES): boolean {
  return (list ?? "").split(",").map((item) => item.trim()).includes(name);
}
