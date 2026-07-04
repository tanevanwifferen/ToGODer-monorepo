import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/index';
import { AIWrapper, StreamChunk } from './AIWrapper';
import { AIProvider } from './Model/AIProvider';
import { ErrorJsonCompletion, ErrorCompletion } from './Errors';
import { ParsedChatCompletion } from 'openai/resources/chat/completions/index';
import { logLlmOutput } from './OutputLogger';

export class OpenAIWrapper implements AIWrapper {
  private apiKey: string;
  private openAI: OpenAI;
  private lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null = null;

  constructor(private model: AIProvider) {
    let apiKey = process.env.OPENAI_API_KEY;
    if (apiKey == null) throw new Error('OpenAI API key is required');
    this.apiKey = apiKey;
    this.openAI = new OpenAI({ apiKey: this.apiKey });
  }

  public get Model(): AIProvider {
    return this.model;
  }

  private async getModeration(
    userAndAgentPrompts: ChatCompletionMessageParam[]
  ): Promise<boolean> {
    try {
      var count = userAndAgentPrompts.length;
      var itemsToSend = userAndAgentPrompts.map((x) => x.content as string);
      if (count > 2) {
        itemsToSend = itemsToSend.slice(count - 2, count);
      }
      const moderationResult = await this.openAI.moderations.create({
        input: itemsToSend,
        model: 'omni-moderation-latest',
      });
      // Check if any of the messages are flagged
      return moderationResult.results
        .map((x) => x.flagged)
        .reduce((a, b) => a || b);
    } catch (e) {
      return true;
    }
  }

  async getResponse(
    systemPrompt: string,
    userAndAgentPrompts: ChatCompletionMessageParam[],
    multiplier: number = 1,
    signal?: AbortSignal
  ): Promise<OpenAI.ChatCompletion> {
    try {
      const isFlagged = await this.getModeration(userAndAgentPrompts);
      if (isFlagged) {
        return ErrorCompletion(this.model);
      }
      const result = await this.openAI.chat.completions.create(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            ...userAndAgentPrompts,
          ],
          model: this.model,
          max_tokens: 16384,
        },
        { signal }
      );
      // Capture usage for non-streaming requests
      const u = result.usage;
      this.lastUsage = u
        ? {
            prompt_tokens: u.prompt_tokens ?? 0 * multiplier,
            completion_tokens: u.completion_tokens ?? 0 * multiplier,
            total_tokens:
              (u.total_tokens ??
                (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)) *
              multiplier,
          }
        : null;

      const msg = result.choices?.[0]?.message;
      logLlmOutput({
        model: this.model,
        method: 'getResponse',
        output: typeof msg?.content === 'string' ? msg.content : undefined,
        toolCalls: Array.isArray(msg?.tool_calls)
          ? msg!.tool_calls.map((tc: any) => ({
              id: tc.id,
              name: tc.function?.name,
              arguments: tc.function?.arguments ?? '',
            }))
          : undefined,
        usage: this.lastUsage,
      });
      return result;
    } catch (error) {
      logLlmOutput({ model: this.model, method: 'getResponse', error });
      console.error('Error:', error);
      throw new Error('Failed to get response from OpenAI API');
    }
  }

  /**
   * Native token streaming via OpenAI SDK. Yields incremental text deltas.
   */
  async *streamResponse(
    systemPrompt: string,
    userAndAgentPrompts: ChatCompletionMessageParam[],
    multiplier: number = 1,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, void> {
    let accumulated = '';
    try {
      // reset usage snapshot for this streaming session
      this.lastUsage = null;

      const stream = await this.openAI.chat.completions.create(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            ...userAndAgentPrompts,
          ],
          model: this.model,
          max_tokens: 16384,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal }
      );

      for await (const chunk of stream as any) {
        // Capture usage if the provider includes it on a terminal chunk
        const usage = chunk?.usage;
        if (usage) {
          this.lastUsage = {
            prompt_tokens:
              ((this.lastUsage as any)?.prompt_tokens ?? 0) +
              (usage.prompt_tokens ?? 0) * multiplier,
            completion_tokens:
              ((this.lastUsage as any)?.completion_tokens ?? 0) +
              (usage.completion_tokens ?? 0) * multiplier,
            total_tokens:
              ((this.lastUsage as any)?.total_tokens ?? 0) +
              (usage.total_tokens ??
                (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)) *
                multiplier,
          };
        }

        // OpenAI ChatCompletionChunk shape: choices[].delta.content
        const choices = chunk?.choices ?? [];
        for (const ch of choices) {
          const delta = ch?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            accumulated += delta;
            yield delta;
          }
        }
      }
      logLlmOutput({
        model: this.model,
        method: 'streamResponse',
        output: accumulated,
        usage: this.lastUsage,
      });
    } catch (error) {
      logLlmOutput({
        model: this.model,
        method: 'streamResponse',
        output: accumulated,
        error,
      });
      console.error('OpenAI stream error:', error);
      throw new Error('Failed to stream response from OpenAI API');
    }
  }

  /**
   * Streaming with tool support. Yields text chunks and tool calls.
   * Tool calls are accumulated across chunks and yielded when complete.
   */
  async *streamResponseWithTools(
    systemPrompt: string,
    userAndAgentPrompts: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    multiplier: number = 1,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk, void, void> {
    let accumulated = '';
    let lastFinishReason: string | undefined;
    const emittedToolCalls: { id: string; name: string; arguments: string }[] = [];
    try {
      this.lastUsage = null;

      const requestParams: any = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...userAndAgentPrompts,
        ],
        model: this.model,
        max_tokens: 16384,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (tools && tools.length > 0) {
        requestParams.tools = tools;
      }

      const stream = await this.openAI.chat.completions.create(requestParams, {
        signal,
      });

      // Track tool calls being accumulated across chunks
      const toolCallAccumulators: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();
      // Indices whose tool_call_start has already been yielded
      const announcedToolCalls = new Set<number>();

      for await (const chunk of stream as any) {
        // Capture usage if provided
        const usage = chunk?.usage;
        if (usage) {
          this.lastUsage = {
            prompt_tokens:
              ((this.lastUsage as any)?.prompt_tokens ?? 0) +
              (usage.prompt_tokens ?? 0) * multiplier,
            completion_tokens:
              ((this.lastUsage as any)?.completion_tokens ?? 0) +
              (usage.completion_tokens ?? 0) * multiplier,
            total_tokens:
              ((this.lastUsage as any)?.total_tokens ?? 0) +
              (usage.total_tokens ??
                (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)) *
                multiplier,
          };
        }

        const choices = chunk?.choices ?? [];
        for (const ch of choices) {
          const delta = ch?.delta;

          // Handle text content
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            accumulated += delta.content;
            yield { type: 'text', content: delta.content };
          }

          // Handle tool calls
          const toolCalls = delta?.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              const index = tc.index ?? 0;

              if (!toolCallAccumulators.has(index)) {
                toolCallAccumulators.set(index, {
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                  arguments: '',
                });
              }

              const accumulator = toolCallAccumulators.get(index)!;

              if (tc.id) {
                accumulator.id = tc.id;
              }
              if (tc.function?.name) {
                accumulator.name = tc.function.name;
              }
              if (tc.function?.arguments) {
                accumulator.arguments += tc.function.arguments;
              }

              // Announce the tool call as soon as its name is known so the
              // client can show activity while arguments are still streaming
              if (!announcedToolCalls.has(index) && accumulator.name) {
                announcedToolCalls.add(index);
                yield {
                  type: 'tool_call_start',
                  id: accumulator.id,
                  name: accumulator.name,
                };
              }
            }
          }

          // Emit complete tool calls on ANY finish reason (e.g. also
          // 'content_filter') — discarding an already-streamed tool call
          // would strand the turn.
          if (ch?.finish_reason) {
            lastFinishReason = ch.finish_reason;
            for (const [, accumulator] of toolCallAccumulators) {
              if (accumulator.id && accumulator.name) {
                emittedToolCalls.push({
                  id: accumulator.id,
                  name: accumulator.name,
                  arguments: accumulator.arguments,
                });
                yield {
                  type: 'tool_call',
                  id: accumulator.id,
                  name: accumulator.name,
                  arguments: accumulator.arguments,
                };
              } else {
                console.warn(
                  `[tool-loop] dropping incomplete tool call (id=${JSON.stringify(
                    accumulator.id
                  )}, name=${JSON.stringify(accumulator.name)}, finish_reason=${ch.finish_reason})`
                );
              }
            }
            toolCallAccumulators.clear();
            announcedToolCalls.clear();
          }
        }
      }
      // Flush tool calls left over if the stream ended without a
      // finish_reason chunk.
      for (const [, accumulator] of toolCallAccumulators) {
        if (accumulator.id && accumulator.name) {
          emittedToolCalls.push({
            id: accumulator.id,
            name: accumulator.name,
            arguments: accumulator.arguments,
          });
          yield {
            type: 'tool_call',
            id: accumulator.id,
            name: accumulator.name,
            arguments: accumulator.arguments,
          };
        }
      }
      toolCallAccumulators.clear();
      logLlmOutput({
        model: this.model,
        method: 'streamResponseWithTools',
        output: accumulated,
        toolCalls: emittedToolCalls,
        usage: this.lastUsage,
        finishReason: lastFinishReason,
      });
    } catch (error) {
      logLlmOutput({
        model: this.model,
        method: 'streamResponseWithTools',
        output: accumulated,
        toolCalls: emittedToolCalls,
        error,
      });
      console.error('OpenAI stream with tools error:', error);
      throw new Error('Failed to stream response with tools from OpenAI API');
    }
  }

  getAndResetLastUsage(): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null {
    const u = this.lastUsage;
    this.lastUsage = null;
    return u;
  }

  async getJSONResponse(
    systemPrompt: string,
    userAndAgentPrompts: ChatCompletionMessageParam[],
    structure?: any,
    multiplier: number = 1,
    signal?: AbortSignal
  ): Promise<ParsedChatCompletion<any>> {
    // Check for moderation flags first
    var isFlagged = await this.getModeration(userAndAgentPrompts);
    if (isFlagged) {
      return ErrorJsonCompletion(this.model);
    }

    const request: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        ...userAndAgentPrompts,
      ],
      model: this.model,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
    };

    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let rawContent: string | undefined;
      try {
        const result = await this.openAI.chat.completions.create(request, {
          signal,
        });
        rawContent = result.choices?.[0]?.message?.content ?? undefined;
        logLlmOutput({
          model: this.model,
          method: 'getJSONResponse',
          output: rawContent,
        });

        const cleaned = stripJsonFences(rawContent ?? '');
        const parsed = JSON.parse(cleaned);
        if (structure && typeof structure.parse === 'function') {
          structure.parse(parsed);
        }
        (result.choices[0].message as any).parsed = parsed;
        result.choices[0].message.content = cleaned;
        return result as unknown as ParsedChatCompletion<any>;
      } catch (error) {
        lastError = error;
        console.error(
          `JSON parse attempt ${attempt}/${maxRetries} failed:`,
          error
        );

        if (attempt === maxRetries) {
          logLlmOutput({
            model: this.model,
            method: 'getJSONResponse',
            output: rawContent,
            error: lastError,
          });
          throw new Error(
            `Failed to get valid JSON response from OpenAI API after ${maxRetries} attempts: ${lastError.message}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    throw new Error('Failed to get JSON response from OpenAI API');
  }
}

function stripJsonFences(s: string): string {
  const trimmed = s.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = trimmed.match(fence);
  return m ? m[1].trim() : trimmed;
}
