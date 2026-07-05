import { ConversationApi } from '../Api/ConversationApi';
import { ChatRequest, ExperienceRequest } from '../Model/ChatRequest';
import { User } from '@prisma/client';
import crypto from 'crypto';
import { ExperienceSeedPrompt } from '../LLM/prompts/experienceprompts';
import { AIProvider, getDefaultModel } from '../LLM/Model/AIProvider';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import exp from 'constants';

export class ChatService {
  private conversationApi: ConversationApi;
  private jwtSecret: string;

  constructor(assistantName: string) {
    this.conversationApi = new ConversationApi(assistantName);
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.jwtSecret = process.env.JWT_SECRET;
  }

  async getChatResponse(body: ChatRequest, user: User | null): Promise<string> {
    // Only allow longer conversations for authenticated users (unless on default model)
    if (body.prompts.length > 10 && user === null && body.model !== getDefaultModel()) {
      return 'Please create an account or login to have longer conversations';
    }

    return await this.conversationApi.getResponse(body, user);
  }

  async getExperienceText(
    request: ExperienceRequest,
    user: User | null
  ): Promise<string> {
    const startText = await this.conversationApi.TranslateText(
      ExperienceSeedPrompt,
      request.language,
      AIProvider.Gpt4oMini,
      user
    );
    return '/experience ' + startText;
  }

  async getTitle(
    content: ChatCompletionMessageParam[],
    model: AIProvider,
    user: User | null
  ): Promise<string> {
    return await this.conversationApi.getTitle(content, model, user);
  }

  getQuote(): string {
    return this.conversationApi.getQuote();
  }

  /**
   * Generates a cryptographic signature for an array of prompts.
   * Uses HMAC SHA256 with the JWT secret to sign the concatenated prompt contents.
   */
  generateSignature(prompts: ChatRequest['prompts']): string {
    return crypto
      .createHmac('sha256', this.jwtSecret)
      .update(prompts.map((x) => x.content).join(' '))
      .digest('base64');
  }

  /**
   * Verifies a cryptographic signature for an array of prompts.
   * @param prompts The array of prompts to verify
   * @param signature The signature to verify against
   * @returns boolean indicating if the signature is valid
   */
  verifySignature(prompts: ChatRequest['prompts'], signature: string): boolean {
    const expectedSignature = this.generateSignature(prompts);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  }

  /**
   * Signs a custom-instructions snapshot together with its timestamp, so
   * clients can later prove both the content and the moment the server saw it.
   * The timestamp is part of the signed payload — tampering with either
   * invalidates the signature.
   */
  generateInstructionsSignature(content: string, timestamp: number): string {
    return crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${timestamp}\n${content}`)
      .digest('base64');
  }

  /**
   * Verifies a signed custom-instructions snapshot (content + timestamp).
   */
  verifyInstructionsSignature(
    content: string,
    timestamp: number,
    signature: string
  ): boolean {
    const expected = this.generateInstructionsSignature(content, timestamp);
    const provided = Buffer.from(signature, 'base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    if (provided.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(provided, expectedBuf);
  }
}
