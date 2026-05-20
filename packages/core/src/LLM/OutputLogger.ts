import { AIProvider } from './Model/AIProvider';

interface LogLlmOutputArgs {
  model: AIProvider;
  method: 'getResponse' | 'streamResponse' | 'streamResponseWithTools' | 'getJSONResponse';
  output?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  error?: unknown;
}

export function logLlmOutput(args: LogLlmOutputArgs): void {
  const entry = {
    ts: new Date().toISOString(),
    model: args.model,
    method: args.method,
    ...(args.output !== undefined ? { output: args.output } : {}),
    ...(args.toolCalls && args.toolCalls.length > 0 ? { tool_calls: args.toolCalls } : {}),
    ...(args.usage ? { usage: args.usage } : {}),
    ...(args.error ? { error: String(args.error) } : {}),
  };
  console.log('[llm-output]', JSON.stringify(entry));
}
