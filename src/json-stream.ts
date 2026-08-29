export function withJsonPropertyOrdering(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withJsonPropertyOrdering);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, withJsonPropertyOrdering(child)]),
  ) as Record<string, unknown>;
  if (result.type === "object" && result.properties && typeof result.properties === "object") {
    result.propertyOrdering = Object.keys(result.properties as Record<string, unknown>);
  }
  return result;
}

function completedObjectText(source: string, propertyName: string): string | undefined {
  let index = 0;
  while (index < source.length) {
    if (source[index] !== '"') {
      index += 1;
      continue;
    }
    const stringStart = index;
    index += 1;
    let value = "";
    let escaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (escaped) {
        escaped = false;
        value += character;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        break;
      } else {
        value += character;
      }
    }
    if (index >= source.length || value !== propertyName) {
      index = Math.max(index + 1, stringStart + 1);
      continue;
    }
    index += 1;
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source[index] !== ":") continue;
    index += 1;
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source[index] !== "{") continue;
    const objectStart = index;
    let depth = 0;
    let inString = false;
    let objectEscaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (objectEscaped) objectEscaped = false;
        else if (character === "\\") objectEscaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(objectStart, index + 1);
      }
    }
    return undefined;
  }
  return undefined;
}

export function completedJsonObjectProperty(
  source: string,
  propertyName: string,
): unknown | undefined {
  const text = completedObjectText(source, propertyName);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
