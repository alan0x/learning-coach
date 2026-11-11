// The subject signal a host sends with a lesson request (subject plan P2,
// shadow mode): the plugins it selected, how confident it was and where the
// choice came from. Coach validates and logs it and still sends the broad
// request; the trace records what a scoped request would have contained.
// It takes the installed plugins as a parameter so the tool entry point does
// not bundle the plugin registry, which lesson-plan.js loads lazily.

export type PluginSource = "jev" | "context" | "none";

export interface PluginSignal {
  plugins: string[];
  plugin_confidence?: number;
  plugin_source: PluginSource;
}

export class PluginSignalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** The parts of an installed plugin the shadow scope needs. */
export interface InstalledPluginView {
  manifest: { id: string };
  recipes: Readonly<Record<string, unknown>>;
}

const MAX_SELECTED_PLUGINS = 3;
const PLUGIN_SOURCES: readonly PluginSource[] = ["jev", "context", "none"];

/**
 * Checks the fields' shape; plugin IDs are checked against the registry with
 * checkPluginIds. Undefined when the host sent no signal fields.
 */
export function parsePluginSignal(input: Record<string, unknown>): PluginSignal | undefined {
  const { plugins, plugin_confidence: confidence, plugin_source: source } = input;
  if (plugins === undefined && confidence === undefined && source === undefined) return undefined;
  if (plugins !== undefined && (!Array.isArray(plugins) || plugins.some((id) => typeof id !== "string"))) {
    throw new PluginSignalError("LESSON_PLUGINS_INVALID", "plugins must be an array of plugin IDs");
  }
  const ids = [...new Set((plugins as string[] | undefined) ?? [])];
  if (ids.length > MAX_SELECTED_PLUGINS) {
    throw new PluginSignalError("LESSON_PLUGINS_INVALID", `plugins selects at most ${MAX_SELECTED_PLUGINS} plugins`);
  }
  if (confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new PluginSignalError("LESSON_PLUGIN_CONFIDENCE_INVALID", "plugin_confidence must be a number from 0 to 1");
  }
  const resolvedSource = source ?? (ids.length ? undefined : "none");
  if (!PLUGIN_SOURCES.includes(resolvedSource as PluginSource)) {
    throw new PluginSignalError("LESSON_PLUGIN_SOURCE_INVALID", "plugin_source must be jev, context or none");
  }
  if (resolvedSource === "none" && ids.length) {
    throw new PluginSignalError("LESSON_PLUGIN_SOURCE_INVALID", "plugin_source none cannot select plugins");
  }
  return {
    plugins: ids,
    ...(confidence !== undefined ? { plugin_confidence: confidence as number } : {}),
    plugin_source: resolvedSource as PluginSource,
  };
}

export interface ShadowScope {
  plugin_source: PluginSource | "absent";
  plugins: string[];
  plugin_confidence?: number;
  /** True when a scoped request would have been sent (§5.3); false means broad. */
  scoped: boolean;
  /** `shared` plus the selected plugins, in registry order; every plugin when broad. */
  scoped_plugins: string[];
  /** Recipes a scoped request would have offered. */
  scoped_recipes: string[];
}

/** Rejects plugin IDs that are not installed; returns the signal with IDs in registry order. */
export function checkPluginIds(signal: PluginSignal | undefined, installed: readonly InstalledPluginView[]): PluginSignal | undefined {
  if (!signal) return undefined;
  const ids = installed.map((plugin) => plugin.manifest.id);
  const unknown = signal.plugins.filter((id) => !ids.includes(id));
  if (unknown.length) throw new PluginSignalError("LESSON_PLUGIN_UNKNOWN", `Unknown plugin ID: ${unknown.join(", ")}`);
  return { ...signal, plugins: ids.filter((id) => signal.plugins.includes(id)) };
}

/** What a scoped request would have contained for this signal. */
export function shadowScope(signal: PluginSignal | undefined, installed: readonly InstalledPluginView[]): ShadowScope {
  const ids = installed.map((plugin) => plugin.manifest.id);
  const selected = signal?.plugins ?? [];
  const scoped = selected.length > 0;
  const included = scoped ? ids.filter((id) => id === "shared" || selected.includes(id)) : ids;
  return {
    plugin_source: signal?.plugin_source ?? "absent",
    plugins: selected,
    ...(signal?.plugin_confidence !== undefined ? { plugin_confidence: signal.plugin_confidence } : {}),
    scoped,
    scoped_plugins: included,
    scoped_recipes: installed.filter((plugin) => included.includes(plugin.manifest.id))
      .flatMap((plugin) => Object.keys(plugin.recipes)),
  };
}

/** The lesson's plugins that a scoped request would not have offered. */
export function pluginsOutsideScope(scope: ShadowScope, lessonPlugins: Readonly<Record<string, string>>): string[] {
  return Object.keys(lessonPlugins).filter((id) => !scope.scoped_plugins.includes(id));
}
