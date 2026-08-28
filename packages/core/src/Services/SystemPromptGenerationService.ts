import { ConversationApi } from '../Api/ConversationApi';
import { ChatRequest } from '../Model/ChatRequest';
import { User } from '@prisma/client';
import { AIProvider } from '../LLM/Model/AIProvider';
import { PromptList } from '../LLM/prompts/promptlist';
import { AutoGenerateSystemPromptPrompt } from '../LLM/prompts/systemPromptGeneration';
import { rootpersona } from '../LLM/prompts/rootprompts';
import { loadSeedV2 } from '../LLM/prompts/seedv2';

/**
 * Service for auto-generating personalized system prompts based on the
 * assistant's character (v2 seed, rootpersona, persona definitions) and
 * existing prompt examples.
 *
 * The memory system injects user context at runtime, so generated prompts
 * must NOT embed or duplicate user memories.
 */
export class SystemPromptGenerationService {
  private conversationApi: ConversationApi;

  constructor(assistantName: string) {
    this.conversationApi = new ConversationApi(assistantName);
  }

  /**
   * Generates a personalized system prompt grounded in the assistant's character
   * (v2 seed identity / rootpersona) and existing prompt examples.
   *
   * Does NOT fetch or embed user memories — the memory system handles user
   * context independently at runtime.
   *
   * @param body ChatRequest containing configurable preferences
   * @param user The user to generate the prompt for
   * @returns The generated character-grounded system prompt
   */
  async generatePersonalizedSystemPrompt(
    body: ChatRequest,
    user: User
  ): Promise<{ systemPrompt?: string }> {
    const promptExamples = this.getPromptExamples();
    const systemPromptInput = this.formatSystemPromptInput(
      body.configurableData,
      promptExamples
    );

    const aiWrapper = this.conversationApi.getAIWrapper(AIProvider.DeepSeekV4Flash, user);
    const response = await aiWrapper.getResponse(
      AutoGenerateSystemPromptPrompt,
      [
        {
          role: 'system',
          content: `Current date: ${new Date().toISOString()}`,
        },
        {
          role: 'user',
          content: systemPromptInput,
        },
      ]
    );

    const generatedPrompt =
      response.choices[0].message.content ||
      'Unable to generate personalized system prompt.';

    return { systemPrompt: generatedPrompt };
  }

  /**
   * Gets examples from the existing prompt library to use as templates.
   */
  private getPromptExamples(): {
    [key: string]: { prompt: string; description: string };
  } {
    const examples: { [key: string]: { prompt: string; description: string } } =
      {};

    // Select a diverse set of prompts as examples
    const exampleKeys = [
      '/default',
      '/growth',
      '/individuation',
      '/practical',
      '/deescalation',
      '/sociallife',
      '/arbitration',
    ];

    for (const key of exampleKeys) {
      if (PromptList[key]) {
        examples[key] = {
          prompt: PromptList[key].prompt,
          description: PromptList[key].description,
        };
      }
    }

    return examples;
  }

  /**
   * Formats the input for the AI system prompt generator, grounded in the
   * assistant's character (v2 seed, rootpersona) — NOT user memories.
   */
  private formatSystemPromptInput(
    configurableData: { [key: string]: string },
    promptExamples: { [key: string]: { prompt: string; description: string } }
  ): string {
    const seedV2 = loadSeedV2();

    let input = '';

    input += 'ASSISTANT ROOT PERSONA (core convictions & identity):\n\n';
    input += rootpersona + '\n\n';

    input += 'V2 SEED PROMPT (voice, response discipline, self-awareness):\n\n';
    input += seedV2 + '\n\n';

    input += 'CONFIGURABLE DATA (user-chosen character preferences):\n\n';
    if (configurableData && Object.keys(configurableData).length > 0) {
      input += JSON.stringify(configurableData, null, 2) + '\n\n';
    } else {
      input += 'No configurable preferences selected.\n\n';
    }

    input += 'EXISTING PROMPT EXAMPLES (templates & tone references):\n\n';
    for (const [key, example] of Object.entries(promptExamples)) {
      input += `${key} - ${example.description}:\n${example.prompt}\n\n---\n\n`;
    }

    input +=
      'Please generate a personalised system prompt grounded in the assistant\'s character above. ' +
      'Do NOT embed user memories or personal history — the memory system handles that at runtime.';

    return input;
  }
}
