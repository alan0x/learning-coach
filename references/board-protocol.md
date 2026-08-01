# OLL Whiteboard Artifact Protocol

Use this protocol for every substantive whiteboard-capable teaching turn.

## Delivery contract

Call `oll_generate_lesson` exactly once for a substantive learning turn. The
tool creates one OLL Authoring Profile document at:

```text
study/oll/<turn_id>.octos-lesson.json
```

Pass `turn_id`, `learner_request`, and any available learner, tutor, session, or
existing-board context. The tool invokes the configured structured-output model,
validates against the pinned OLL schema and semantic rules, serializes JSON, and
returns the artifact through `files_to_send`.

Do not call `write_file` or `send_file` for this artifact. Do not put protocol
JSON in Markdown or in the learner-facing reply. The reply stays short and
conversational; the OLL Beat narration is the classroom explanation.

## Top-level document

```json
{
  "dsl": "octos.lesson",
  "version": "0.1",
  "profile": "authoring",
  "lesson": {
    "mode": "explain",
    "language": "zh-CN",
    "title": "课程标题",
    "goals": ["本轮要教会的具体知识"]
  },
  "steps": [],
  "close": {
    "summary": "本轮完成了什么",
    "focus": ["summary"]
  }
}
```

Generate a complete continuous explanation in one turn. Do not insert a quiz,
checkpoint, request for confirmation, or a pause for the learner unless source
information is missing or unreadable.

## Lesson rhythm

- Organize the lesson as Step → Beat → Action.
- Give every Step one auditable `purpose`.
- Put one main teaching move in each Beat.
- Make `say` directly usable as teacher speech and keep it aligned with that
  Beat's visible actions.
- Reveal the reasoning progressively; do not create the final answer before it
  is explained.
- Finish the requested scope in the same artifact.
- End with a concise conclusion or knowledge structure and focus it.

Example Beat:

```json
{
  "key": "complete-square",
  "say": "一次项系数六的一半是三，所以这里要构造 x 加三的平方。",
  "delivery": "patient",
  "actions": [
    {
      "do": "write",
      "as": "half-coefficient",
      "kind": "note",
      "role": "derivation",
      "content": {"title": "取一半", "items": ["6 ÷ 2 = 3"]},
      "place": {"relation": "below", "anchor": "problem", "gap": "normal"}
    },
    {
      "do": "focus",
      "when": "after_speech",
      "targets": ["half-coefficient"],
      "intent": "current_step"
    }
  ]
}
```

## Aliases and references

Use lowercase local aliases matching `^[a-z][a-z0-9-]{0,63}$`. Define before
use. `write as` creates a node, `connect as` creates a connection, and `group
as` creates a group.

- `place.anchor`: node or group.
- `emphasize.target` and `point.target`: node, `node#fragment`, connection, or
  group.
- `group.members[]`: node or group.
- `focus.targets[]` and `close.focus[]`: node, group, or connection.
- Use `node#fragment` only for an addressable fragment declared with `as`.
- Never use asset IDs or region IDs directly as board references.

Each delivered turn is normalized into the same classroom but owns its local
aliases. On a follow-up, create only the additional explanation requested. Use
the supplied board summary as context, but do not assume previous local aliases
are available in the new artifact and do not repeat the entire original lesson.

## Actions

Use only `write`, `revise`, `emphasize`, `connect`, `group`, `focus`, `point`,
and `expression`. Use `when` only for `before_speech`, `during_speech`, or
`after_speech`. Do not output coordinates, zoom, duration, HTML, SVG paths, or
JavaScript.

Create content with `write`:

```json
{
  "do": "write",
  "as": "result",
  "kind": "math",
  "role": "conclusion",
  "content": {"latex": "y=(x+3)^2-4"},
  "place": {
    "relation": "below",
    "anchor": "derivation",
    "align": "start",
    "gap": "normal"
  }
}
```

Useful content forms:

- `text`: `{"text":"..."}` or addressable `fragments`.
- `math`: `{"latex":"..."}` or `fragments` containing `as` and `latex`.
- `note`: `{"title":"...","items":["..."]}`.
- `table`: `{"columns":["..."],"rows":[["..."]]}`.
- `diagram`: semantic `elements`, `edges`, `points`, `guides`, or `regions`;
  give addressable items an `as` alias and refer to those aliases inside the
  same diagram.
- `image`: only a controlled `asset_id`; map supplied regions through
  `content.regions[]` entries containing `as` and the exact `source_region`.

For prose that contains short formulas, keep the node as `text` or `note` and
delimit only the formula spans with `$...$` or `\\(...\\)`. Formula-first board
work belongs in a `math` node with canonical `content.latex`. Beat `say` text is
spoken by TTS, so express equations and operators in natural language there;
never put raw LaTeX delimiters or commands in narration.

Use relative placement only: `new_region`, `below`, `above`, `left_of`,
`right_of`, `near`, `inside`, or `overlay`. Except for `new_region`, include an
existing node or group as `anchor`.

Use `connect` for a visible relationship:

```json
{
  "do": "connect",
  "as": "reason-to-result",
  "from": "reason",
  "to": "result",
  "relation": "therefore",
  "label": "所以"
}
```

Use `group` for a named teaching section and `focus` to direct attention during
the current Beat.

## Visual grounding

For an uploaded image, use only assets and regions explicitly listed in the
session context. State uncertainty in the teaching reply when evidence is
unclear. Never invent text, labels, coordinates, or image regions.

## Failure fallback

If `oll_generate_lesson` fails, do not claim that the board is ready and do not
write a substitute OLL file manually. Give the learner a concise apology while
leaving technical details in the tool result and logs. Never expose protocol
JSON to the learner.
