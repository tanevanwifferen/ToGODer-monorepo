import { ToolRegistry } from './ToolRegistry';

/**
 * Safelist of section names the AI is allowed to modify.
 * The AI can add, update, or remove only these named sections.
 * Critical/core instructions live outside these sections and
 * cannot be modified.
 */
const MODIFIABLE_SECTIONS = new Set([
  'preferences',
  'context',
  'tone',
  'tool_preferences',
]);

/**
 * Per-session store of prompt modifications.
 * Keyed by sessionId → Map<sectionName, content>
 */
const sessionStore = new Map<string, Map<string, string>>();

/**
 * Derive a stable session identifier from a conversation.
 * Uses the first user message + assistant name to create
 * a deterministic key that persists across API requests
 * within the same conversation.
 */
export function deriveSessionId(
  firstUserMessage: string | undefined,
  assistantName: string,
): string {
  const content = firstUserMessage ?? 'new-conversation';
  // Simple hash: truncate + normalize for stability
  const normalized = content.trim().toLowerCase().slice(0, 200);
  return `${assistantName}:${normalized}`;
}

/**
 * Get the current prompt modifications for a session.
 * Returns a Map<sectionName, content> or an empty map.
 */
export function getSessionModifications(
  sessionId: string,
): Map<string, string> {
  return sessionStore.get(sessionId) ?? new Map();
}

/**
 * Merge session prompt modifications into the system prompt.
 * Each modifiable section is appended as a named block.
 * Empty/blank content for a section removes that block.
 */
export function mergeSessionModifications(
  systemPrompt: string,
  sessionId: string,
): string {
  const mods = getSessionModifications(sessionId);
  if (mods.size === 0) return systemPrompt;

  let result = systemPrompt;

  for (const [section, content] of mods) {
    // Remove any previous block for this section
    const marker = `<!-- session:${section} -->`;
    const endMarker = `<!-- /session:${section} -->`;
    const regex = new RegExp(
      `\\n?${escapeRegex(marker)}[\\s\\S]*?${escapeRegex(endMarker)}\\n?`,
      'g',
    );
    result = result.replace(regex, '');

    // Add the section block if content is non-empty
    if (content && content.trim().length > 0) {
      result += `\n\n${marker}\n## ${capitalize(section)}\n${content}\n${endMarker}`;
    }
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Register the update_system_prompt tool.
 *
 * The AI can call this to add, update, or remove named sections
 * of its system prompt. Only sections on the safelist are accepted.
 * Modifications persist for the duration of the conversation session.
 */
export function registerSystemPromptTool(): void {
  const registry = ToolRegistry.getInstance();

  registry.register(
    'update_system_prompt',
    {
      type: 'function',
      function: {
        name: 'update_system_prompt',
        description:
          'Modify a named section of your system prompt for this conversation session. ' +
          'Use this to set preferences, context, or tone that will persist for all ' +
          'subsequent messages in this conversation. ' +
          'Valid sections: ' +
          Array.from(MODIFIABLE_SECTIONS).join(', ') +
          '. ' +
          'Call with action="remove" or content="" to clear a section. ' +
          'Call with action="list" to see current modifications.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['set', 'remove', 'list'],
              description:
                'set: add or update a section. remove: clear a section. list: show current modifications.',
            },
            section: {
              type: 'string',
              description:
                'The section name to modify. Must be one of: ' +
                Array.from(MODIFIABLE_SECTIONS).join(', ') +
                '. Required for set and remove actions.',
            },
            content: {
              type: 'string',
              description:
                'The content to set for this section. Omit or use "" to clear. Only used with action="set".',
            },
          },
          required: ['action'],
        },
      },
    },
    async (ctx) => {
      const action = ctx.arguments.action as string;
      const section = ctx.arguments.section as string | undefined;
      const content = (ctx.arguments.content as string) ?? '';

      // Determine session ID from the request
      const firstUserMsg = ctx.request.prompts.find(
        (p) => p.role === 'user',
      )?.content;
      const sessionId = deriveSessionId(
        typeof firstUserMsg === 'string' ? firstUserMsg : undefined,
        ctx.request.assistant_name ?? 'ToGODer',
      );

      // Handle list action
      if (action === 'list') {
        const mods = getSessionModifications(sessionId);
        if (mods.size === 0) {
          return 'No system prompt modifications are active for this session.';
        }
        let result = 'Current system prompt modifications:\n';
        for (const [sec, val] of mods) {
          result += `\n### ${sec}\n${val}\n`;
        }
        return result;
      }

      // Validate section for set/remove actions
      if (!section || typeof section !== 'string') {
        return (
          'Error: "section" parameter is required for set and remove actions. ' +
          'Valid sections: ' +
          Array.from(MODIFIABLE_SECTIONS).join(', ') +
          '.'
        );
      }

      const normalizedSection = section.toLowerCase().trim();

      if (!MODIFIABLE_SECTIONS.has(normalizedSection)) {
        return (
          `Error: section "${section}" is not modifiable. ` +
          'Valid sections: ' +
          Array.from(MODIFIABLE_SECTIONS).join(', ') +
          '. ' +
          'Core instructions cannot be modified.'
        );
      }

      // Get or create session modifications map
      let mods = sessionStore.get(sessionId);
      if (!mods) {
        mods = new Map();
        sessionStore.set(sessionId, mods);
      }

      if (action === 'remove') {
        mods.delete(normalizedSection);
        return (
          `Section "${normalizedSection}" has been removed. ` +
          'It will no longer appear in subsequent system prompts for this session.'
        );
      }

      // action === 'set'
      if (!content || content.trim().length === 0) {
        mods.delete(normalizedSection);
        return (
          `Section "${normalizedSection}" has been cleared (empty content). ` +
          'It will no longer appear in subsequent system prompts for this session.'
        );
      }

      mods.set(normalizedSection, content.trim());
      return (
        `Section "${normalizedSection}" has been updated. ` +
        'The new content will be included in all subsequent system prompts for this session.'
      );
    },
  );
}
