import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse, ToolDefinition, ContentBlock } from './types';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const anthropicMessages = messages.map((m) => toAnthropicMessage(m));

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    return {
      text,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    };
  }

  // Anthropic needs the full content array (including tool_use blocks) appended
  // to the conversation. We surface this so the agent can push the raw blocks.
  async chatRaw(
    messages: Anthropic.MessageParam[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<{ response: Anthropic.Message }> {
    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    return { response };
  }
}

function toAnthropicMessage(m: LLMMessage): Anthropic.MessageParam {
  if (typeof m.content === 'string') {
    return { role: m.role, content: m.content };
  }

  const content: Anthropic.ContentBlockParam[] = m.content.map((block) => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    // tool_result
    return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
  });

  return { role: m.role, content };
}

// Not used directly — kept for reference
export type { ContentBlock };
