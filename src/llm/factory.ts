import { LLMProvider, ModelOption } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

export function createProvider(
  option: ModelOption,
  keys: { anthropicApiKey?: string; openaiApiKey?: string }
): LLMProvider {
  switch (option.provider) {
    case 'anthropic': {
      if (!keys.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
      return new AnthropicProvider(keys.anthropicApiKey, option.model);
    }
    case 'openai': {
      if (!keys.openaiApiKey) throw new Error('OPENAI_API_KEY is not set.');
      return new OpenAIProvider(keys.openaiApiKey, option.model);
    }
  }
}
