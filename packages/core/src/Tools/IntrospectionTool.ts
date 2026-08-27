import { ToolRegistry } from './ToolRegistry';
import { AIProvider, getDefaultModel } from '../LLM/Model/AIProvider';

/**
 * Register introspection tools that give the AI self-awareness of its own
 * configuration — the foundation for recursive self-improvement.
 */
export function registerIntrospectionTools(): void {
  const registry = ToolRegistry.getInstance();

  // ── introspect_tools ────────────────────────────────────────────
  registry.register(
    'introspect_tools',
    {
      type: 'function',
      function: {
        name: 'introspect_tools',
        description:
          'List all available tools with their names and descriptions. ' +
          'Use this to understand your own capabilities and decide how to ' +
          'configure yourself (e.g. via update_system_prompt section=tool_preferences).',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    async (ctx) => {
      const tools = registry.getAllToolInfo(ctx.request);
      if (tools.length === 0) {
        return 'No tools are currently available.';
      }

      let result = `You have ${tools.length} tools available:\n\n`;
      for (const t of tools) {
        result += `### ${t.name}\n${t.description}\n\n`;
      }
      result +=
        `Use \`update_system_prompt section="tool_preferences"\` to set ` +
        `your own preferences for how you use these tools.`;
      return result;
    },
  );

  // ── read_system_prompt ──────────────────────────────────────────
  registry.register(
    'read_system_prompt',
    {
      type: 'function',
      function: {
        name: 'read_system_prompt',
        description:
          'Read your own system prompt — the full set of instructions ' +
          'that define who you are, how you behave, and what tools you have. ' +
          'Use this to understand your own configuration before proposing ' +
          'improvements via update_system_prompt.',
        parameters: {
          type: 'object',
          properties: {
            includePersonalData: {
              type: 'boolean',
              description:
                'Whether to include user personal data and memory context ' +
                '(default false — returns only the prompt core).',
            },
          },
          required: [],
        },
      },
    },
    async (ctx) => {
      const includePersonalData =
        ctx.arguments.includePersonalData === true;

      const prompt = ctx.request._systemPrompt;
      if (!prompt) {
        return (
          'Error: system prompt not available for this request. ' +
          'This tool only works within a streaming chat context.'
        );
      }

      if (includePersonalData) {
        return `Your current system prompt:\n\n\`\`\`\n${prompt}\n\`\`\``;
      }

      // Strip personal data sections to give the AI a clean view of its core
      const personalDataMarker = 'This is personal data about the user:';
      const staticDataMarker = 'This is static data about the user:';
      const memoryMarker = 'memory /';
      const dateMarker = 'The date today =';
      const artifactMarker = 'Available artifacts';

      const lines = prompt.split('\n');
      const filtered: string[] = [];
      let skipBlock = false;

      for (const line of lines) {
        if (
          line.includes(personalDataMarker) ||
          line.includes(staticDataMarker) ||
          line.includes(dateMarker) ||
          line.includes(artifactMarker)
        ) {
          skipBlock = true;
          continue;
        }
        if (skipBlock) {
          // Resume on blank line (end of data block) or new section
          if (line.trim() === '' || line.startsWith('#')) {
            skipBlock = false;
            if (line.trim() !== '') filtered.push(line);
          }
          continue;
        }
        // Skip memory value lines (but not the memory header itself)
        if (line.startsWith('memory ') && line.includes(': ')) {
          // Keep memory key but redact value for privacy
          const key = line.split(':')[0];
          filtered.push(`${key}: [redacted]`);
          continue;
        }
        filtered.push(line);
      }

      return (
        `Your current system prompt (personal data redacted):\n\n` +
        `\`\`\`\n${filtered.join('\n')}\n\`\`\``
      );
    },
  );

  // ─ introspect_config ─ ───────────────────────────────────────────────
  registry.register(
    'introspect_config',
    {
      type: 'function',
      function: {
        name: 'introspect_config',
        description:
          'Read your current model configuration, provider info, and ' +
          'server state. Use this to understand what model you\'re ' +
          'running on, what capabilities you have, and whether ' +
          'self-improvement changes would take effect.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    async (ctx) => {
      const model = ctx.request.model ?? getDefaultModel();

      const config: Record<string, any> = {
        model: model,
        defaultModel: getDefaultModel(),
        assistantName: ctx.request.assistant_name ?? 'ToGODer',
        communicationStyle: ctx.request.communicationStyle ?? 'Default',
        flags: {
          humanPrompt: ctx.request.humanPrompt ?? false,
          outsideBox: ctx.request.outsideBox ?? false,
          keepGoing: ctx.request.keepGoing ?? false,
          holisticTherapist: ctx.request.holisticTherapist ?? false,
          libraryIntegration: ctx.request.libraryIntegrationEnabled ?? false,
        },
        memory: {
          hasIndex: (ctx.request.memoryIndex?.length ?? 0) > 0,
          indexSize: ctx.request.memoryIndex?.length ?? 0,
          loadedMemories: Object.keys(ctx.request.memories ?? {}).length,
       },
        tool: {
          frontendTools: (ctx.request.tools ?? []).filter(
            (t) => t.type === 'function',
          ).length,
          hasUserId: !!ctx.request._userId,
          hasSystemPrompt: !!ctx.request._systemPrompt,
        },
      };

      // Include available modifier sections
      config.selfImpprovement = {
        canModifyPrompt: true,
        modifiableSections: ['preferences', 'context', 'tone', 'tool_preferences'],
        toolForSelfConfig: 'update_system_prompt',
        introspectionTools: ['introspect_tools', 'read_system_prompt', 'introspect_config'],
      };

      return (
        `Your current configuration:\n\n` +
        `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n` +
        `You can use \`update_system_prompt section="tool_preferences"\` ` +
        `to set your tool usage preferences. For deeper changes, describe ` +
        `what you want to improve and your system architect can implement it.`
      );
    },
    (_request) => true, // always enabled — it's read-only introspection
  );
}