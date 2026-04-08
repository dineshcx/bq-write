import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAnthropicClient(apiKey: string): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const MODEL = 'claude-opus-4-6';
