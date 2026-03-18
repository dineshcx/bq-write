import OpenAI from 'openai';
import {
  LLMProvider, LLMMessage, LLMResponse, ToolDefinition, ContentBlock,
} from './types';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.flatMap((m) => toOpenAIMessages(m)),
    ];

    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: 'auto',
    });

    const message = response.choices[0]?.message;
    if (!message) throw new Error('No response from OpenAI');

    const toolCalls = (message.tool_calls ?? [])
      .filter((tc): tc is OpenAI.ChatCompletionMessageFunctionToolCall => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      text: message.content ?? '',
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    };
  }
}

function toOpenAIMessages(m: LLMMessage): OpenAI.ChatCompletionMessageParam[] {
  if (typeof m.content === 'string') {
    return [{ role: m.role, content: m.content }];
  }

  const results: OpenAI.ChatCompletionMessageParam[] = [];
  const toolUseBlocks = m.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
  const toolResultBlocks = m.content.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result');
  const textBlocks = m.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text');

  if (toolUseBlocks.length > 0) {
    // Assistant message with tool calls
    results.push({
      role: 'assistant',
      content: textBlocks.map((b) => b.text).join('\n') || null,
      tool_calls: toolUseBlocks.map((b) => ({
        id: b.id,
        type: 'function' as const,
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      })),
    });
  } else if (toolResultBlocks.length > 0) {
    // Tool result messages — one per result
    for (const block of toolResultBlocks) {
      results.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: block.content,
      });
    }
  } else if (textBlocks.length > 0) {
    results.push({ role: m.role, content: textBlocks.map((b) => b.text).join('\n') });
  }

  return results;
}
