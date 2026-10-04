import type { AuthoringAction } from "octos-lesson-language";

export interface CompiledVisual {
  actions: AuthoringAction[];
  whole: string;
  primaryScene?: string;
  parts: Map<string, string>;
}

interface RenderedVisual {
  node: string;
  content: Record<string, unknown>;
  signature?: ReturnType<typeof cardIdentity>;
}

/** Stable, conservative identity of program-produced cards, independent of component names. */
function cardIdentity(kind: string, content: Record<string, unknown>) {
  const fragments = new Map<string, string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.as === "string" && !fragments.has(record.as)) fragments.set(record.as, `part-${fragments.size}`);
    Object.values(record).forEach(collect);
  };
  collect(content);
  const localReference = (value: string) => {
    const [head, ...tail] = value.split(".");
    return [fragments.get(head) ?? head, ...tail].join(".");
  };
  const normalize = (value: unknown, key = "", path = ""): unknown => {
    if (typeof value === "string") {
      if (key === "expression") return value.replace(/\s+/gu, "");
      if (["as", "target", "from", "to", "center"].includes(key)) return localReference(value);
      // Coordinate names are notation; dimensional axis labels are retained.
      if (kind === "plot" && path.startsWith("axes.") && key === "label" && ["x", "y", "θ"].includes(value)) return "coordinate";
      return value;
    }
    if (Array.isArray(value)) return value.map(child => normalize(child, key, path));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([name]) => {
        if (!path && name === "title") return false;
        // View ranges/styles are presentation. Keep all extra curves, points,
        // measurements, units, bindings and interaction settings in the identity.
        if (kind === "plot") {
          if (path.startsWith("axes.") && ["min", "max"].includes(name)) return false;
          if ((path === "curves" || path === "points") && ["label", "color"].includes(name)) return false;
        }
        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => [name, normalize(child, name, path ? `${path}.${name}` : name)]));
  };
  return { identity: JSON.stringify([kind, normalize(content)]), fragments };
}

/** Course-local registry. Reuse does not erase the surrounding composite or its relationships. */
export class CompiledVisualRegistry {
  private readonly cards = new Map<string, RenderedVisual[]>();

  reuse(visual: CompiledVisual, distinct: boolean, onInvalidComparison: () => never): CompiledVisual {
    if (this.cards.size === 0) {
      for (const action of visual.actions) {
        if (action.do !== "write" || !["plot", "geometry", "scene3d", "diagram"].includes(action.kind)) continue;
        const cards = this.cards.get(action.kind) ?? [];
        cards.push({ node: action.as, content: action.content as Record<string, unknown> });
        this.cards.set(action.kind, cards);
      }
      return visual;
    }
    const aliases = new Map<string, string>();
    const reused = new Set<string>();
    const pending: Array<[string, RenderedVisual]> = [];
    let cardCount = 0;
    for (const action of visual.actions) {
      if (action.do !== "write" || !["plot", "geometry", "scene3d", "diagram"].includes(action.kind)) continue;
      cardCount += 1;
      const priorCards = this.cards.get(action.kind) ?? [];
      const content = action.content as Record<string, unknown>;
      // The first card of a kind has nothing to match. Defer its identity work
      // until another component produces that kind, keeping first playback fast.
      const signature = priorCards.length ? cardIdentity(action.kind, content) : undefined;
      const existing = signature ? priorCards.find(card => {
        card.signature ??= cardIdentity(action.kind, card.content);
        return card.signature.identity === signature.identity;
      }) : undefined;
      if (existing && signature) {
        reused.add(action.as);
        aliases.set(action.as, existing.node);
        const oldFragments = new Map([...existing.signature!.fragments].map(([name, canonical]) => [canonical, name]));
        for (const [name, canonical] of signature.fragments) aliases.set(`${action.as}#${name}`, `${existing.node}#${oldFragments.get(canonical)!}`);
      } else pending.push([action.kind, { node: action.as, content, signature }]);
    }
    if (distinct && cardCount > 0 && reused.size === cardCount) onInvalidComparison();
    for (const [kind, card] of pending) {
      const cards = this.cards.get(kind) ?? [];
      cards.push(card);
      this.cards.set(kind, cards);
    }
    if (!reused.size) return visual;
    const reference = (value: string) => aliases.get(value) ?? value;
    const remap = (value: unknown, key = ""): unknown => {
      if (typeof value === "string") return ["target", "targets", "from", "to", "anchor", "members"].includes(key) ? reference(value) : value;
      if (Array.isArray(value)) return value.map(child => remap(child, key));
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, remap(child, name)]));
    };
    return {
      actions: visual.actions.map(action => action.do === "write" && reused.has(action.as)
        ? { do: "focus" as const, targets: [reference(action.as)], intent: "继续观察已有的同一画面" }
        : remap(action) as AuthoringAction),
      whole: reference(visual.whole),
      ...(visual.primaryScene ? { primaryScene: reference(visual.primaryScene) } : {}),
      parts: new Map([...visual.parts].map(([name, target]) => [name, reference(target)])),
    };
  }
}
