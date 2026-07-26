# Whiteboard Artifact Protocol

Load this reference before creating a `.octos-board.json` artifact.

## Output contract

Keep the learner-facing assistant reply as natural spoken teaching. Create and
deliver one artifact for the same turn:

```text
study/board/<turn_id>.octos-board.json
```

Use this exact tool sequence when both tools are available:

1. Call `write_file` with the path above and the complete JSON packet.
2. Wait for `write_file` to succeed.
3. Call `send_file` with the same workspace-relative path.
4. Wait for `send_file` to succeed before completing the turn.

`write_file` only persists the packet in the session workspace. It does not
attach the packet to the assistant response, and the learning client cannot
render a file that was not delivered through `send_file`.

Do not wrap the JSON in Markdown fences and do not paste protocol JSON into the
normal assistant reply.

Use this top-level shape:

```json
{
  "version": 1,
  "lessonId": "stable-topic-id",
  "turnId": "turn id from client context",
  "title": "short board title",
  "segments": [
    {
      "id": "unique-segment-id",
      "speech": "One sentence copied exactly from the spoken reply.",
      "actions": []
    }
  ]
}
```

Use at most 48 segments, 12 actions per segment, and 800 characters per text
field. Use unique IDs under 120 characters. Use world coordinates within
`-50000..50000`.

## Teaching rhythm

- Put one main teaching move in each segment.
- Focus the relevant region before adding distant content.
- Add only content mentioned by the matching speech segment.
- Prefer a short derivation over an answer dump.
- Use a checkpoint after explanation or demonstration.
- Reuse stable element IDs when a follow-up refers to existing content.
- Set `fromId`, `toId`, `targetId`, or `memberIds` only to known element IDs.

## Action allowlist

### Write text

```json
{
  "id": "concept-title",
  "type": "write_text",
  "text": "配方法",
  "at": { "x": 400, "y": 180 },
  "tone": "accent",
  "size": "lg",
  "semanticLevel": "topic"
}
```

Use `tone`: `ink`, `muted`, or `accent`; `size`: `sm`, `md`, `lg`, or `xl`;
and `semanticLevel`: `detail`, `summary`, or `topic`.

### Write formula

```json
{
  "id": "formula-vertex",
  "type": "write_formula",
  "latex": "y=(x-2)^2-1",
  "at": { "x": 500, "y": 360 },
  "tone": "accent",
  "size": "lg",
  "semanticLevel": "summary"
}
```

Use plain KaTeX-compatible LaTeX. Do not include markup.

### Draw axes and a quadratic

```json
{
  "id": "axes",
  "type": "draw_axes",
  "at": { "x": 900, "y": 220 },
  "width": 500,
  "height": 400,
  "xDomain": [-1, 5],
  "yDomain": [-2, 7]
}
```

```json
{
  "id": "parabola",
  "type": "plot_function",
  "axesId": "axes",
  "function": {
    "kind": "quadratic",
    "coefficients": [1, -4, 3]
  },
  "color": "blue"
}
```

Use `mark_point` with `axesId`, a numeric `[x,y]` point, and a short label.

### Relate and emphasize

Use:

- `highlight` with `targetId`, optional `label`, and `yellow`, `blue`, or
  `coral`;
- `connect` with `fromId`, `toId`, and an optional short label;
- `group` with title, position, size, member IDs, and an optional summary.

Groups create far-zoom knowledge nodes. Put durable concepts in groups and use
connections to express prerequisite, transformation, example, or consequence.

### Focus and checkpoint

```json
{
  "id": "focus-derivation",
  "type": "focus",
  "at": { "x": 700, "y": 380 },
  "zoom": 0.9
}
```

```json
{
  "id": "check-1",
  "type": "checkpoint",
  "prompt": "y=x²+6x+5 的对称轴是多少？",
  "at": { "x": 520, "y": 760 }
}
```

## Fallbacks

When the needed visual is outside the allowlist:

1. use text and formula actions when sufficient;
2. use basic relationships and groups to preserve structure;
3. request an ordinary image/HTML visual through existing capabilities only
   when it materially helps;
4. never invent an unsupported action.

If the source image is unclear, do not create a confident board
representation. Ask the learner to improve the image first.
