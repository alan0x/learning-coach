// Model help for a learner who records their own lesson: Octo's question
// between cards, reading a handwritten formula as LaTeX for "Make it neat",
// and the review after the last card. Every reply is validated here; nothing
// the model returns reaches the lesson without the learner confirming it.

export const TEACH_OCTO_QUESTION_TOOL = "oll_teach_octo_question";
export const TEACH_INK_TO_MATH_TOOL = "oll_teach_ink_to_math";
export const TEACH_REVIEW_TOOL = "oll_teach_review";

export type TopicType = "on_map_lit" | "on_map_unlit" | "math_off_map" | "other";

export interface TeachLessonContext {
  language: string;
  topic: string;
  topic_type: TopicType;
  goals: string[];
}

/** What is on one recorded card: the words the learner said and what the board shows, described by the app. */
export interface TeachCardSummary {
  key: string;
  title: string;
  said: string;
  board: string[];
}

export interface OctoQuestionInput {
  turn_id: string;
  lesson: TeachLessonContext;
  cards: TeachCardSummary[];
  card_key: string;
}

export interface InkToMathInput {
  turn_id: string;
  lesson: Pick<TeachLessonContext, "language">;
  ink_media: string;
}

export interface ReviewInput {
  turn_id: string;
  lesson: TeachLessonContext;
  cards: TeachCardSummary[];
}

export interface OctoQuestion { question: string }
export interface InkToMath { latex: string; confidence: "high" | "medium" | "low"; readable: boolean }
export type ReviewKind = "none" | "slip" | "misconception" | "unclear";
export interface CardReview { key: string; status: "good" | "check"; kind: ReviewKind; message: string }
export interface LessonReview { cards: CardReview[]; overall: string }

type Json = Record<string, unknown>;

const TOPIC_TYPES: readonly TopicType[] = ["on_map_lit", "on_map_unlit", "math_off_map", "other"];

function object(value: unknown, what: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what} must be an object`);
  return value as Json;
}

function text(value: unknown, what: string, max = 4_000): string {
  if (typeof value !== "string") throw new Error(`${what} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${what} is too long`);
  return trimmed;
}

function parseJson(raw: string, what: string): Json {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${what} is not valid JSON: ${(error as Error).message}`);
  }
  return object(value, what);
}

function parseLesson(value: unknown): TeachLessonContext {
  const lesson = object(value, "lesson");
  const topicType = lesson.topic_type as TopicType;
  if (!TOPIC_TYPES.includes(topicType)) throw new Error("lesson.topic_type is invalid");
  if (!Array.isArray(lesson.goals)) throw new Error("lesson.goals must be a list");
  return {
    language: text(lesson.language, "lesson.language", 32) || "en-US",
    topic: text(lesson.topic, "lesson.topic", 200),
    topic_type: topicType,
    goals: lesson.goals.slice(0, 8).map((goal, index) => text(goal, `lesson.goals[${index}]`, 300)),
  };
}

function parseCards(value: unknown): TeachCardSummary[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) throw new Error("cards must list one to eight cards");
  return value.map((entry, index) => {
    const card = object(entry, `cards[${index}]`);
    if (!Array.isArray(card.board)) throw new Error(`cards[${index}].board must be a list`);
    return {
      key: text(card.key, `cards[${index}].key`, 64),
      title: text(card.title, `cards[${index}].title`, 200),
      said: text(card.said, `cards[${index}].said`, 2_000),
      board: card.board.slice(0, 24).map((item, position) => text(item, `cards[${index}].board[${position}]`, 300)),
    };
  });
}

export function parseOctoQuestionInput(raw: string): OctoQuestionInput {
  const input = parseJson(raw, "Octo question input");
  const cards = parseCards(input.cards);
  const cardKey = text(input.card_key, "card_key", 64);
  if (!cards.some((card) => card.key === cardKey)) throw new Error("card_key must name one of the cards");
  return { turn_id: text(input.turn_id, "turn_id", 128), lesson: parseLesson(input.lesson), cards, card_key: cardKey };
}

export function parseInkToMathInput(raw: string): InkToMathInput {
  const input = parseJson(raw, "Ink to math input");
  const lesson = object(input.lesson, "lesson");
  return {
    turn_id: text(input.turn_id, "turn_id", 128),
    lesson: { language: text(lesson.language, "lesson.language", 32) || "en-US" },
    ink_media: text(input.ink_media, "ink_media", 512),
  };
}

export function parseReviewInput(raw: string): ReviewInput {
  const input = parseJson(raw, "Review input");
  return { turn_id: text(input.turn_id, "turn_id", 128), lesson: parseLesson(input.lesson), cards: parseCards(input.cards) };
}

export const OCTO_QUESTION_SCHEMA: Json = {
  type: "object",
  additionalProperties: false,
  properties: { question: { type: "string" } },
  required: ["question"],
};

export const INK_TO_MATH_SCHEMA: Json = {
  type: "object",
  additionalProperties: false,
  properties: {
    latex: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    readable: { type: "boolean" },
  },
  required: ["latex", "confidence", "readable"],
};

export const REVIEW_SCHEMA: Json = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          status: { type: "string", enum: ["good", "check"] },
          kind: { type: "string", enum: ["none", "slip", "misconception", "unclear"] },
          message: { type: "string" },
        },
        required: ["key", "status", "kind", "message"],
      },
    },
    overall: { type: "string" },
  },
  required: ["cards", "overall"],
};

const SAFETY = "The learner is a child. Never ask for or mention personal details (names, school, home, age, contact). Never include links. Write only in the lesson language.";

export function octoQuestionPrompts(input: OctoQuestionInput): { systemPrompt: string; prompt: string } {
  return {
    systemPrompt: [
      "You are Octo, a friendly octopus playing a curious student while a child teaches you a lesson card by card.",
      "Ask exactly one short question (at most 25 words) about the card just recorded, the kind a curious classmate would ask, so the child explains a little more.",
      "Do not state or hint at the answer, do not correct the child, do not praise at length, and do not ask about anything not on the cards.",
      "For a topic that is not math, ask about what the child said, not about facts the child did not mention.",
      SAFETY,
    ].join(" "),
    prompt: JSON.stringify({ lesson: input.lesson, cards_so_far: input.cards, card_just_recorded: input.card_key }),
  };
}

export function inkToMathPrompts(input: InkToMathInput): { systemPrompt: string; prompt: string } {
  return {
    systemPrompt: [
      "Read only the handwritten math in the image and transcribe it as KaTeX-compatible LaTeX, exactly as written, including any mistakes.",
      "Do not solve, simplify, complete or correct it. Use \\dfrac for stacked fractions.",
      "If the handwriting is not math or cannot be read reliably, set readable to false, latex to an empty string and confidence to low.",
    ].join(" "),
    prompt: JSON.stringify({ lesson_language: input.lesson.language, handwriting_image: "authoritative" }),
  };
}

export function reviewPrompts(input: ReviewInput): { systemPrompt: string; prompt: string } {
  const scope = {
    on_map_lit: "Check the math.",
    on_map_unlit: "Check the math.",
    math_off_map: "Check the math, but this topic is outside the course map: only flag errors you are certain of.",
    other: "This topic is not math: comment only on clarity, never on whether facts are true, so use kind 'unclear' or 'none' only.",
  }[input.lesson.topic_type];
  const kinds = input.lesson.topic_type === "other"
    ? "Mark a card 'check' with kind 'unclear' when the explanation is hard to follow, and say what to add."
    : "Mark a card 'check' with kind 'slip' when what the child said contradicts what the board shows (they wrote or graphed it correctly but said it wrong), 'misconception' when the method or result itself is wrong, or 'unclear' when the explanation skips a step. Say exactly what to fix, with the correct value.";
  return {
    systemPrompt: [
      "You review a lesson a child recorded, card by card, and give kind, specific feedback the child can act on by re-recording a card.",
      scope,
      kinds,
      "Mark a card 'good' with kind 'none' when nothing needs fixing, with one short encouraging sentence about what works.",
      "Return one review for every card, in order, with each message at most 40 words, and one overall sentence.",
      SAFETY,
    ].join(" "),
    prompt: JSON.stringify({ lesson: input.lesson, cards: input.cards }),
  };
}

const LINK = /https?:\/\/|www\./i;

function safeSentence(value: unknown, what: string, max: number): string {
  const sentence = text(value, what, max);
  if (!sentence) throw new Error(`${what} is empty`);
  if (LINK.test(sentence)) throw new Error(`${what} contains a link`);
  return sentence;
}

export function parseOctoQuestion(raw: string): OctoQuestion {
  const value = parseJson(raw, "Octo question");
  return { question: safeSentence(value.question, "question", 240) };
}

/** LaTeX commands that could load or link anything are refused outright. */
const UNSAFE_LATEX = /\\(href|url|includegraphics|html\w*|class|style|data|def|newcommand|renewcommand|input|include)\b/i;

export function parseInkToMath(raw: string): InkToMath {
  const value = parseJson(raw, "Ink to math");
  const confidence = value.confidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") throw new Error("confidence is invalid");
  if (typeof value.readable !== "boolean") throw new Error("readable must be a boolean");
  const latex = text(value.latex, "latex", 400);
  if (UNSAFE_LATEX.test(latex)) throw new Error("latex uses a command that is not allowed");
  if (value.readable && !latex) throw new Error("readable math needs latex");
  return { latex: value.readable ? latex : "", confidence: value.readable ? confidence : "low", readable: value.readable };
}

export function parseReview(raw: string, input: ReviewInput): LessonReview {
  const value = parseJson(raw, "Review");
  if (!Array.isArray(value.cards)) throw new Error("cards must be a list");
  const reviews = value.cards.map((entry, index) => {
    const card = object(entry, `cards[${index}]`);
    const status = card.status;
    const kind = card.kind as ReviewKind;
    if (status !== "good" && status !== "check") throw new Error(`cards[${index}].status is invalid`);
    if (!["none", "slip", "misconception", "unclear"].includes(kind)) throw new Error(`cards[${index}].kind is invalid`);
    if ((status === "good") !== (kind === "none")) throw new Error(`cards[${index}] status and kind disagree`);
    if (input.lesson.topic_type === "other" && (kind === "slip" || kind === "misconception")) {
      throw new Error(`cards[${index}] judges facts in a topic that is not math`);
    }
    return { key: text(card.key, `cards[${index}].key`, 64), status, kind, message: safeSentence(card.message, `cards[${index}].message`, 400) } as CardReview;
  });
  const expected = input.cards.map((card) => card.key);
  if (reviews.map((review) => review.key).join("|") !== expected.join("|")) throw new Error("the review must cover every card in order");
  return { cards: reviews, overall: safeSentence(value.overall, "overall", 400) };
}
