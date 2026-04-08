/**
 * Rough token estimate: ~4 characters per token.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
