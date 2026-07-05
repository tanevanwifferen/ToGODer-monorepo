import { AIProvider } from './Model/AIProvider';

interface LogLlmOutputArgs {
  model: AIProvider;
  method: 'getResponse' | 'streamResponse' | 'streamResponseWithTools' | 'getJSONResponse';
  output?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  finishReason?: string;
  error?: unknown;
}

/**
 * Whether full LLM content (output text, tool call arguments) may be written
 * to the console. Conversations contain personal data, so this must stay off
 * anywhere but development environments.
 */
export function logLlmContentEnabled(): boolean {
  const v = (process.env.LOG_LLM_CONTENT ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function logLlmOutput(args: LogLlmOutputArgs): void {
  const contentEnabled = logLlmContentEnabled();
  const entry = {
    ts: new Date().toISOString(),
    model: args.model,
    method: args.method,
    // Without LOG_LLM_CONTENT, log only content-free metadata: output length
    // and tool call names, never the text or arguments themselves.
    ...(args.output !== undefined
      ? contentEnabled
        ? { output: args.output }
        : { output_length: args.output.length }
      : {}),
    ...(args.toolCalls && args.toolCalls.length > 0
      ? contentEnabled
        ? { tool_calls: args.toolCalls }
        : { tool_call_names: args.toolCalls.map((tc) => tc.name) }
      : {}),
    ...(args.usage ? { usage: args.usage } : {}),
    ...(args.finishReason ? { finish_reason: args.finishReason } : {}),
    ...(args.error ? { error: String(args.error) } : {}),
  };
  console.log('[llm-output]', JSON.stringify(entry));
}
