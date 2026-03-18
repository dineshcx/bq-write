export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use';
}

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse>;
}

export type ProviderName = 'anthropic' | 'openai';

export interface ModelOption {
  provider: ProviderName;
  model: string;
  label: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { provider: 'anthropic', model: 'claude-opus-4-6',     label: 'Claude Opus 4.6    (Anthropic)' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6',   label: 'Claude Sonnet 4.6  (Anthropic)' },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5   (Anthropic)' },
  { provider: 'openai',    model: 'gpt-4o',              label: 'GPT-4o             (OpenAI)' },
  { provider: 'openai',    model: 'gpt-4o-mini',         label: 'GPT-4o Mini        (OpenAI)' },
];
