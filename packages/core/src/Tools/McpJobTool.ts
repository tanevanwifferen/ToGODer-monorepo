import { ToolRegistry } from './ToolRegistry';
import { getMcpClientManager } from './McpClientManager';

/**
 * Register the `mcp_job_status` backend tool. The LLM uses this to poll for
 * the result of an async MCP tool job dispatched via callToolAsync.
 */
export function registerMcpJobTool(): void {
  const registry = ToolRegistry.getInstance();
  const mgr = getMcpClientManager();

  registry.register(
    'mcp_job_status',
    {
      type: 'function',
      function: {
        name: 'mcp_job_status',
        description:
          'Check the status of an MCP tool job that was started asynchronously. ' +
          'Returns the current status (pending, running, complete, error) and the ' +
          'result if complete. Use this to poll for the result of a long-running ' +
          'MCP tool call that returned a job ID.',
        parameters: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'The job ID returned by the async MCP tool dispatch',
            },
          },
          required: ['jobId'],
        },
      },
    },
    async (ctx) => {
      const { jobId } = ctx.arguments as { jobId: string };
      if (!jobId) return 'Error: jobId is required.';

      const job = mgr.getJobStatus(jobId);
      if (!job) {
        return `No job found with ID "${jobId}". It may have expired or never existed.`;
      }

      switch (job.status) {
        case 'pending':
          return `Job ${jobId} (${job.toolName}) is pending — waiting to start.`;
        case 'running':
          return `Job ${jobId} (${job.toolName}) is still running. Check again later.`;
        case 'complete':
          return `Job ${jobId} (${job.toolName}) completed.\n\n${job.result}`;
        case 'error':
          return `Job ${jobId} (${job.toolName}) failed with error: ${job.error}`;
        default:
          return `Job ${jobId} has unknown status: ${(job as any).status}`;
      }
    },
  );
}
