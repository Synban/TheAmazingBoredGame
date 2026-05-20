import { generate } from "random-words";

export function pickRandomWord(): string {
  const result = generate({ exactly: 1 });
  if (Array.isArray(result)) return result[0] ?? "";
  return result;
}
