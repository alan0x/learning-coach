// The model's raw replies, as Coach logs them with OLL_DEBUG_GENERATION=1 for evaluation harnesses to
// keep and replay. Each reply is one framed record on one stderr line: the reply is JSON-escaped, so a
// pretty-printed (multi-line) reply stays whole, and nothing is cut short.

export const RAW_REPLY_PREFIX = "learning-coach: raw ";

export interface RawReplyRecord {
  provider: string;
  label: string;
  /** "content": the model's text as streamed; "payload": the provider's whole response envelope. */
  kind: "content" | "payload";
  body: unknown;
}

/** One stderr line (with its newline) carrying a whole reply. */
export function frameRawReply(record: RawReplyRecord): string {
  return `${RAW_REPLY_PREFIX}${JSON.stringify(record)}\n`;
}

/** The model's text in a provider envelope: candidates[].content.parts[].text, joined. */
function envelopeText(payload: unknown): string | undefined {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates;
  if (!Array.isArray(candidates)) return undefined;
  const text = candidates.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => (typeof part.text === "string" ? part.text : "")).join("");
  return text || undefined;
}

/**
 * The model's text from one captured line (with or without the prefix): a framed record, or the two
 * older single-line forms ("<provider> <label> payload: <envelope>" and "<provider> <label> content: <text>").
 */
export function modelTextFromRawReply(line: string): string | undefined {
  const rest = line.startsWith(RAW_REPLY_PREFIX) ? line.slice(RAW_REPLY_PREFIX.length) : line;
  if (rest.startsWith("{")) {
    try {
      const record = JSON.parse(rest) as Partial<RawReplyRecord>;
      if (record.kind === "content" && typeof record.body === "string") return record.body;
      if (record.kind === "payload") return envelopeText(record.body);
    } catch { /* not a framed record */ }
  }
  // "<provider> <label> payload: …": the provider name may contain spaces ("Gemini API"); the first
  // marker, before any JSON, ends the heading.
  const legacy = /^[^{]*? (payload|content): /u.exec(rest);
  if (!legacy) return undefined;
  const body = rest.slice(legacy[0].length);
  if (legacy[1] === "content") return body || undefined;
  try { return envelopeText(JSON.parse(body)); } catch { return undefined; }
}
