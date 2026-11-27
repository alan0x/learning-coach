// Every card of a kind as a lesson plays it, for the judges of the tap cards with a second card (make ten, the trade
// card, times ten; Coach #199): the lesson's first card holds the question and the practice; each later card is a
// second card, a demonstration on its own example. The lesson is followed as OLL plays it (as the compare judge's
// compareIn does): steps and beats in order, a beat's replay start first (each listed variable set to its value, or its
// starting value when listed without one), then its actions phase by phase (before, during, after speech). Each card's
// values are recorded when it is written, revised (OLL replaces its content; a revision carries no bindings), after
// each animation of a variable it binds and each replay, and at each task's start that sets a variable it binds, with
// what changed them. The judges read a card's fields from these values with their own `cardAt`.

const PHASES = ["before_speech", "during_speech", "after_speech"];

/** The variables a start sets: each listed one to its value, or its starting value when listed without one. */
function startValues(start, declared) {
  const listed = start.variables ?? Object.keys(start.values ?? {});
  return Object.fromEntries(listed.map((alias) => [alias, Object.hasOwn(start.values ?? {}, alias) ? start.values[alias] : declared[alias]]));
}

/** Every card of `kind`, in the order played: { as, write, content, states: [{ via, values, content }] }. */
export function cardsIn(lesson, kind) {
  const variables = lesson?.lesson?.variables ?? [];
  const declared = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const values = { ...declared };
  const cards = new Map();
  const boundTo = (card, aliases) => (card.content?.bindings ?? []).some((binding) => aliases.includes(String(binding.expression).trim()));
  const show = (card, via, at = values) => card.states.push({ via, values: { ...at }, content: card.content });
  for (const step of lesson?.steps ?? []) for (const beat of step.beats ?? []) {
    if (beat.start?.kind === "replay") {
      const set = startValues(beat.start, declared);
      Object.assign(values, set);
      for (const card of cards.values()) if (boundTo(card, Object.keys(set))) show(card, "replay");
    }
    for (const phase of PHASES) for (const action of beat.actions ?? []) {
      if ((action.when ?? "during_speech") !== phase) continue;
      if (action.do === "write" && action.kind === kind) {
        const card = { as: action.as, write: action, content: action.content, states: [] };
        cards.set(action.as, card);
        show(card, "write");
      } else if (action.do === "revise" && cards.has(action.target) && action.content && typeof action.content === "object") {
        const card = cards.get(action.target);
        card.content = action.content;
        show(card, "revise");
      } else if (action.do === "animate" && typeof action.variable === "string") {
        values[action.variable] = action.value;
        for (const card of cards.values()) if (boundTo(card, [action.variable])) show(card, `animate ${action.variable}`);
      }
    }
  }
  // A task's start sets the variables it lists, over what the lesson left (the practice of the first card may reach a
  // variable another card binds).
  for (const task of lesson?.lesson?.tasks ?? []) {
    if (!task.start) continue;
    const set = startValues(task.start, declared);
    for (const card of cards.values()) if (boundTo(card, Object.keys(set))) show(card, `task start ${task.as ?? task.prompt ?? ""}`.trim(), { ...values, ...set });
  }
  return { cards: [...cards.values()], declared };
}

/** The tasks that work or read a card: its node, its anchor, or an operation on it. */
export function tasksOn(tasks, as) {
  return (tasks ?? []).filter((task) => task.completion?.node === as || task.anchor === as
    || (task.allowed_operations ?? []).some((operation) => operation.node === as));
}

/**
 * The checks every second card takes, for a kind's judge. `read(content, values)` reads the card at those values;
 * `kind` gives, for a card read at a state: `example` (its pair as text), `same(card, pair)` (the same example, or a
 * question or practice pair), `fresh(card)` (a fault or undefined), `position(card)` (how far the demonstration is, a
 * number), `end(card)` (where it ends). `language` is the lesson's card language. Returns the second cards' { as, example }.
 */
export function judgeSecondCards({ cards, tasks, question, practices, read, kind, check, language }) {
  const seconds = [];
  if (cards.length > 1) check("at most one second card of the kind", cards.length <= 2, `${cards.length - 1} second cards: ${cards.slice(1).map((card) => card.as).join(", ")}`);
  for (const card of cards.slice(1)) {
    const label = `${card.as} (a second card): `;
    const states = card.states.map((state) => ({ via: state.via, card: read(state.content, state.values) }));
    const [first, ...later] = states;
    const example = kind.example(first.card);
    seconds.push({ as: card.as, example });
    const repeats = [["the question's", question], ...practices.map((pair) => ["a practice", pair])].find(([, pair]) => pair && kind.same(first.card, pair));
    check(`${label}its example differs from the question and the practice`, !repeats, `example ${example} is ${repeats?.[0]} pair`);
    // At every state (a revision, a replay, a task's start), the card shows its example, in the lesson's language.
    const changed = later.find((state) => !kind.same(state.card, first.card));
    check(`${label}its pair stays its example`, !changed, changed ? `${changed.via}: ${kind.example(changed.card)} after ${example}` : "");
    check(`${label}it speaks the lesson's language`, states.every((state) => state.card.language === language),
      `card ${states.map((state) => `${state.card.language} (${state.via})`).join(" then ")}, lesson ${language}`);
    const fresh = kind.fresh(first.card);
    check(`${label}its demonstration opens fresh`, !fresh, fresh);
    // Forward only (a replay or a task's start shows the card again from a start), and to its end by a move forward:
    // an animation or a revision, never a replay or a start that jumps there.
    const positions = states.map((state) => kind.position(state.card));
    const restarts = (via) => via === "replay" || via.startsWith("task start");
    const back = later.findIndex((state, k) => !restarts(state.via) && !(positions[k + 1] >= positions[k]));
    const moves = states.map((state, k) => `${positions[k]} (${state.via})`).join(" -> ");
    check(`${label}its demonstration plays forward`, back < 0, `moves ${moves}`);
    const end = kind.end(first.card);
    const reached = later.some((state, k) => !restarts(state.via) && state.via !== "write" && positions[k + 1] === end && positions[k + 1] > positions[k]);
    check(`${label}its demonstration plays to its end`, reached, `moves ${moves}; its end is ${end}, reached by a move forward`);
    const on = tasksOn(tasks, card.as);
    check(`${label}no task is anchored on it`, on.length === 0, on.map((task) => task.as ?? task.prompt).join(", "));
  }
  return seconds;
}

/** The judge's line for a lesson's second cards: "second cards: 1 (9 + 4)". */
export const secondCardsText = (seconds) => (seconds?.length ? `second cards: ${seconds.length} (${seconds.map((each) => each.example).join("; ")})` : "");
