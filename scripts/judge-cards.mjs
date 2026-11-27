// Every card of a kind as a lesson plays it, for the judges of the tap cards with a second card (make ten, the trade
// card, times ten; Coach #199): the lesson's first card holds the question and the practice; each later card is a
// second card, a demonstration on its own example. The lesson is followed as OLL plays it (as the compare judge does):
// steps and beats in order, a beat's replay start first (each listed variable set to its value, or its starting value
// when listed without one), then its actions phase by phase (before, during, after speech). Each card's values are
// recorded when it is written and after each animation of a variable it binds and each replay, with what changed them.
// The judges read a card's fields from these values with their own `cardAt`.

const PHASES = ["before_speech", "during_speech", "after_speech"];

/** Every card of `kind`, in the order written: { as, content, states: [{ via, values }] }. */
export function cardsIn(lesson, kind) {
  const variables = lesson?.lesson?.variables ?? [];
  const declared = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const values = { ...declared };
  const cards = new Map();
  const boundTo = (card, alias) => (card.content?.bindings ?? []).some((binding) => String(binding.expression).trim() === alias);
  const show = (card, via) => card.states.push({ via, values: { ...values } });
  for (const step of lesson?.steps ?? []) for (const beat of step.beats ?? []) {
    if (beat.start?.kind === "replay") {
      const listed = beat.start.variables ?? Object.keys(beat.start.values ?? {});
      for (const alias of listed) values[alias] = Object.hasOwn(beat.start.values ?? {}, alias) ? beat.start.values[alias] : declared[alias];
      for (const card of cards.values()) if (listed.some((alias) => boundTo(card, alias))) show(card, "replay");
    }
    for (const phase of PHASES) for (const action of beat.actions ?? []) {
      if ((action.when ?? "during_speech") !== phase) continue;
      if (action.do === "write" && action.kind === kind) {
        const card = { as: action.as, content: action.content, states: [] };
        cards.set(action.as, card);
        show(card, "write");
      } else if (action.do === "animate" && typeof action.variable === "string") {
        values[action.variable] = action.value;
        for (const card of cards.values()) if (boundTo(card, action.variable)) show(card, `animate ${action.variable}`);
      }
    }
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
 * `kind` gives, for a card read at its write: `example` (its pair as text), `same(card, pair)` (the same example as a
 * question or practice pair), `fresh(card)` (a fault or undefined), `position(card)` (how far the demonstration is,
 * a number), `end(card)` (where it ends). Returns the second cards' { as, example }.
 */
export function judgeSecondCards({ cards, tasks, question, practices, read, kind, check }) {
  const seconds = [];
  for (const card of cards.slice(1)) {
    const label = `${card.as} (a second card): `;
    const states = card.states.map((state) => ({ via: state.via, card: read(card.content, state.values) }));
    const [first, ...later] = states;
    const example = kind.example(first.card);
    seconds.push({ as: card.as, example });
    const repeats = [["the question's", question], ...practices.map((pair) => ["a practice", pair])].find(([, pair]) => pair && kind.same(first.card, pair));
    check(`${label}its example differs from the question and the practice`, !repeats, `example ${example} is ${repeats?.[0]} pair`);
    const fresh = kind.fresh(first.card);
    check(`${label}its demonstration opens fresh`, !fresh, fresh);
    // Forward only (a replay shows the demonstration again from its start), and to its end.
    const positions = states.map((state) => kind.position(state.card));
    const back = later.findIndex((state, k) => state.via !== "replay" && !(positions[k + 1] >= positions[k]));
    check(`${label}its demonstration plays forward`, back < 0, `moves ${positions.join(" -> ")}`);
    const end = kind.end(first.card);
    check(`${label}its demonstration plays to its end`, positions.includes(end), `moves ${positions.join(" -> ")}; its end is ${end}`);
    const on = tasksOn(tasks, card.as);
    check(`${label}no task is anchored on it`, on.length === 0, on.map((task) => task.as ?? task.prompt).join(", "));
  }
  return seconds;
}

/** The judge's line for a lesson's second cards: "second cards: 1 (9 + 4)". */
export const secondCardsText = (seconds) => (seconds?.length ? `second cards: ${seconds.length} (${seconds.map((each) => each.example).join("; ")})` : "");
