/** Mihon titles often use a curly apostrophe; typed search uses a straight one. */
export function containsTextVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const straight = trimmed.replaceAll(/[\u2018\u2019]/g, "'");
  const curly = straight.replaceAll("'", "\u2019");
  return [...new Set([trimmed, straight, curly])];
}
