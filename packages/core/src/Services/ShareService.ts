import { SharedArtifact, SharedChat, User } from '@prisma/client';
import { ChatService } from './ChatService';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { getDbContext } from '../Entity/Database';

/**
 * A server-signed snapshot of the custom instructions that were active while
 * a chat/artifact was being created. Signed over content + timestamp, so the
 * moment of each instruction change is verifiable.
 */
export interface SignedInstructionSnapshot {
  content: string;
  timestamp: number;
  signature: string;
}

/**
 * Service for managing shared conversations.
 * Handles creating shared chats, verifying message signatures, and retrieving shared chats.
 */
export class ShareService {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService('');
  }

  /**
   * Verifies every snapshot in an instruction history and returns it as a
   * JSON string ready for storage. Returns undefined when the history is
   * empty or missing.
   * @throws Error if any snapshot signature is invalid
   */
  private verifyInstructionHistory(
    instructionHistory: SignedInstructionSnapshot[] | undefined
  ): string | undefined {
    if (!instructionHistory || instructionHistory.length === 0) {
      return undefined;
    }
    for (const snapshot of instructionHistory) {
      const isValid = this.chatService.verifyInstructionsSignature(
        snapshot.content,
        snapshot.timestamp,
        snapshot.signature
      );
      if (!isValid) {
        throw new Error('Invalid instruction snapshot signature');
      }
    }
    return JSON.stringify(instructionHistory);
  }

  /**
   * Creates a new shared chat after verifying all message signatures.
   * @param messages Array of messages with their signatures
   * @param title Title for the shared chat
   * @param description Optional description for the shared chat
   * @param owner The user sharing the chat
   * @param visibility PUBLIC or PRIVATE
   * @param instructionHistory Signed custom-instruction snapshots to display with the chat
   * @returns The created SharedChat
   * @throws Error if any message or instruction signature is invalid
   */
  async createSharedChat(
    messages: { message: ChatCompletionMessageParam; signature: string }[],
    title: string,
    description: string | undefined,
    owner: User,
    visibility: string = 'PUBLIC',
    instructionHistory?: SignedInstructionSnapshot[]
  ): Promise<SharedChat> {
    // Verify all message signatures
    var msgsTexts = messages.map((x) => x.message);
    var msgSignature = messages[messages.length - 1].signature;
    const isValid = this.chatService.verifySignature(msgsTexts, msgSignature);
    if (!isValid) {
      throw new Error('Invalid message signature');
    }

    // Store the chat with verified messages
    return await getDbContext().sharedChat.create({
      data: {
        ownerId: owner.id,
        title,
        description,
        messages: JSON.stringify(messages),
        visibility,
        instructionHistory: this.verifyInstructionHistory(instructionHistory),
      },
    });
  }

  /**
   * Creates a new shared artifact. Artifacts are user/AI-authored documents,
   * so their content carries no message signature; any attached instruction
   * history is verified before storing.
   * @throws Error if any instruction snapshot signature is invalid
   */
  async createSharedArtifact(
    title: string,
    description: string | undefined,
    content: string,
    owner: User,
    visibility: string = 'PUBLIC',
    instructionHistory?: SignedInstructionSnapshot[]
  ): Promise<SharedArtifact> {
    return await getDbContext().sharedArtifact.create({
      data: {
        ownerId: owner.id,
        title,
        description,
        content,
        visibility,
        instructionHistory: this.verifyInstructionHistory(instructionHistory),
      },
    });
  }

  /**
   * Retrieves a shared artifact by its ID and increments its view count.
   */
  async getSharedArtifact(id: string): Promise<SharedArtifact | null> {
    const artifact = await getDbContext().sharedArtifact.findUnique({
      where: { id },
      include: { owner: true },
    });

    if (artifact) {
      await getDbContext().sharedArtifact.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    return artifact;
  }

  /**
   * Deletes a shared artifact if the requesting user is the owner.
   * @returns true if deletion was successful, false if artifact not found
   * @throws Error if user is not the owner
   */
  async deleteSharedArtifact(id: string, requestingUser: User): Promise<boolean> {
    const artifact = await getDbContext().sharedArtifact.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!artifact) return false;
    if (artifact.ownerId !== requestingUser.id) {
      throw new Error('Only the original sharer can delete this artifact');
    }

    await getDbContext().sharedArtifact.delete({
      where: { id },
    });
    return true;
  }

  /**
   * Retrieves a shared chat by its ID.
   * @param id The ID of the shared chat
   * @returns The SharedChat with its messages
   */
  async getSharedChat(id: string): Promise<SharedChat | null> {
    const chat = await getDbContext().sharedChat.findUnique({
      where: { id },
      include: { owner: true },
    });

    if (chat) {
      // Increment view count
      await getDbContext().sharedChat.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    return chat;
  }

  /**
   * Lists shared chats with pagination.
   * @param page Page number (1-based)
   * @param limit Number of items per page
   * @returns Array of SharedChats and total count
   */
  async listSharedChats(
    page: number = 1,
    limit: number = 50
  ): Promise<{ chats: SharedChat[]; total: number }> {
    const skip = (page - 1) * limit;

    const [chats, total] = await Promise.all([
      getDbContext().sharedChat.findMany({
        where: { visibility: 'PUBLIC' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        //include: { owner: true },
      }),
      getDbContext().sharedChat.count(),
    ]);

    return { chats, total };
  }

  /**
   * Deletes a shared chat if the requesting user is the owner.
   * @param id The ID of the shared chat to delete
   * @param requestingUser The user attempting to delete the chat
   * @returns true if deletion was successful, false if chat not found
   * @throws Error if user is not the owner
   */
  async deleteSharedChat(id: string, requestingUser: User): Promise<boolean> {
    const chat = await getDbContext().sharedChat.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!chat) return false;
    if (chat.ownerId !== requestingUser.id) {
      throw new Error('Only the original sharer can delete this chat');
    }

    await getDbContext().sharedChat.delete({
      where: { id },
    });
    return true;
  }
}
