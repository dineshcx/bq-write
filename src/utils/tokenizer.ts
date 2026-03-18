/**
 * Rough token estimate: ~4 characters per token (GPT/Claude approximation).
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
