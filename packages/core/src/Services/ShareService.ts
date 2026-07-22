import {
  SharedArtifact,
  SharedChat,
  SharedFolder,
  SharedFolderItem,
  User,
} from '@prisma/client';
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
 * Service for managing shared conversations, artifacts, and folders.
 * Handles creating shared chats, verifying message/artifact signatures,
 * and retrieving shared content.
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
    instructionHistory: SignedInstructionSnapshot[] | undefined,
  ): string | undefined {
    if (!instructionHistory || instructionHistory.length === 0) {
      return undefined;
    }
    for (const snapshot of instructionHistory) {
      const isValid = this.chatService.verifyInstructionsSignature(
        snapshot.content,
        snapshot.timestamp,
        snapshot.signature,
      );
      if (!isValid) {
        throw new Error('Invalid instruction snapshot signature');
      }
    }
    return JSON.stringify(instructionHistory);
  }

  // ── Chat sharing ──────────────────────────────────────────────────

  /**
   * Creates a new shared chat after verifying all message signatures.
   * @throws Error if any message or instruction signature is invalid
   */
  async createSharedChat(
    messages: { message: ChatCompletionMessageParam; signature: string }[],
    title: string,
    description: string | undefined,
    owner: User,
    visibility: string = 'PUBLIC',
    instructionHistory?: SignedInstructionSnapshot[],
  ): Promise<SharedChat> {
    // Verify all message signatures
    const msgsTexts = messages.map((x) => x.message);
    const msgSignature = messages[messages.length - 1].signature;
    const isValid = this.chatService.verifySignature(msgsTexts, msgSignature);
    if (!isValid) {
      throw new Error('Invalid message signature');
    }

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
   * Retrieves a shared chat by its ID and increments its view count.
   */
  async getSharedChat(id: string): Promise<SharedChat | null> {
    const chat = await getDbContext().sharedChat.findUnique({
      where: { id },
      include: { owner: true },
    });

    if (chat) {
      await getDbContext().sharedChat.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    return chat;
  }

  /**
   * Lists shared chats with pagination.
   */
  async listSharedChats(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ chats: SharedChat[]; total: number }> {
    const skip = (page - 1) * limit;

    const [chats, total] = await Promise.all([
      getDbContext().sharedChat.findMany({
        where: { visibility: 'PUBLIC' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      getDbContext().sharedChat.count(),
    ]);

    return { chats, total };
  }

  /**
   * Deletes a shared chat if the requesting user is the owner.
   */
  async deleteSharedChat(
    id: string,
    requestingUser: User,
  ): Promise<boolean> {
    const chat = await getDbContext().sharedChat.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!chat) return false;
    if (chat.ownerId !== requestingUser.id) {
      throw new Error('Only the original sharer can delete this chat');
    }

    await getDbContext().sharedChat.delete({ where: { id } });
    return true;
  }

  /**
   * Copies a shared chat into the requesting user's own chats.
   * Returns a copy record { id, title } so the client can navigate to it.
   * Mirrors the iOS `importChat` / RN `copySharedConversation` pattern.
   */
  async copySharedChat(
    id: string,
    requestingUser: User,
  ): Promise<{ chatId: string; title: string }> {
    const shared = await getDbContext().sharedChat.findUnique({
      where: { id },
    });
    if (!shared) throw new Error('Shared chat not found');

    // Generate a unique local chat ID (the client manages its own chat storage;
    // the backend only returns enough for the client to create the local copy).
    return { chatId: shared.id, title: shared.title };
  }

  // ── Artifact sharing ──────────────────────────────────────────────

  /**
   * Generates an HMAC signature for artifact content to prove it was
   * AI-generated. Any artifact without a valid signature is presumed
   * hand-authored and MUST be rejected.
   */
  generateArtifactSignature(title: string, content: string): string {
    return this.chatService.generateSignature([
      { role: 'user', content: title },
      { role: 'assistant', content },
    ] as any);
  }

  /**
   * Verifies an artifact's server-issued signature. Returns true only if
   * the artifact content was cryptographically signed by this server.
   */
  verifyArtifactSignature(
    title: string,
    content: string,
    signature: string,
  ): boolean {
    return this.chatService.verifySignature(
      [
        { role: 'user', content: title },
        { role: 'assistant', content },
      ] as any,
      signature,
    );
  }

  /**
   * Creates a new shared artifact.
   *
   * **Signature gate:** Artifacts MUST carry a valid server-issued
   * `artifactSignature`. If the signature is missing or invalid the
   * artifact is rejected — this prevents hand-authored (human-written)
   * content from being published.
   *
   * @throws Error if the artifact signature is missing or invalid
   */
  async createSharedArtifact(
    title: string,
    description: string | undefined,
    content: string,
    owner: User,
    visibility: string = 'PUBLIC',
    instructionHistory?: SignedInstructionSnapshot[],
    artifactSignature?: string,
  ): Promise<SharedArtifact> {
    // Reject artifacts without a valid signature — no human-authored content
    if (!artifactSignature) {
      throw new Error(
        'Artifact signature is required. Artifacts must be AI-generated and carry a valid server signature.',
      );
    }
    if (!this.verifyArtifactSignature(title, content, artifactSignature)) {
      throw new Error(
        'Invalid artifact signature. Only AI-generated artifacts with a valid server signature can be shared.',
      );
    }

    return await getDbContext().sharedArtifact.create({
      data: {
        ownerId: owner.id,
        title,
        description,
        content,
        visibility,
        instructionHistory: this.verifyInstructionHistory(instructionHistory),
        artifactSignature,
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
   */
  async deleteSharedArtifact(
    id: string,
    requestingUser: User,
  ): Promise<boolean> {
    const artifact = await getDbContext().sharedArtifact.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!artifact) return false;
    if (artifact.ownerId !== requestingUser.id) {
      throw new Error('Only the original sharer can delete this artifact');
    }

    await getDbContext().sharedArtifact.delete({ where: { id } });
    return true;
  }

  // ── Folder sharing ────────────────────────────────────────────────

  /**
   * Creates a new shared folder. The folder is initially empty — items are
   * added afterwards via `addItemToSharedFolder`.
   */
  async createSharedFolder(
    title: string,
    description: string | undefined,
    owner: User,
    visibility: string = 'PUBLIC',
    artifactIds: string[] = [],
  ): Promise<SharedFolder> {
    const folder = await getDbContext().sharedFolder.create({
      data: {
        ownerId: owner.id,
        title,
        description,
        visibility,
      },
    });

    // Add initial items if provided
    if (artifactIds.length > 0) {
      const items = artifactIds.map((artifactId, index) => ({
        folderId: folder.id,
        artifactId,
        sortOrder: index,
      }));
      await getDbContext().sharedFolderItem.createMany({ data: items });
    }

    return await getDbContext().sharedFolder.findUnique({
      where: { id: folder.id },
      include: { items: { include: { artifact: true }, orderBy: { sortOrder: 'asc' } }, owner: true },
    }) as SharedFolder;
  }

  /**
   * Retrieves a shared folder with all its items and increments its view count.
   */
  async getSharedFolder(id: string): Promise<SharedFolder | null> {
    const folder = await getDbContext().sharedFolder.findUnique({
      where: { id },
      include: {
        items: { include: { artifact: true }, orderBy: { sortOrder: 'asc' } },
        owner: true,
      },
    });

    if (folder) {
      await getDbContext().sharedFolder.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    return folder;
  }

  /**
   * Deletes a shared folder if the requesting user is the owner.
   */
  async deleteSharedFolder(
    id: string,
    requestingUser: User,
  ): Promise<boolean> {
    const folder = await getDbContext().sharedFolder.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!folder) return false;
    if (folder.ownerId !== requestingUser.id) {
      throw new Error('Only the original sharer can delete this folder');
    }

    await getDbContext().sharedFolder.delete({ where: { id } });
    return true;
  }

  /**
   * Adds an individual artifact to an existing shared folder.
   * Only the folder owner may add items.
   */
  async addItemToSharedFolder(
    folderId: string,
    artifactId: string,
    requestingUser: User,
  ): Promise<SharedFolderItem> {
    const folder = await getDbContext().sharedFolder.findUnique({
      where: { id: folderId },
      select: { ownerId: true },
    });
    if (!folder) throw new Error('Folder not found');
    if (folder.ownerId !== requestingUser.id) {
      throw new Error('Only the folder owner can add items');
    }

    // Determine next sort order
    const lastItem = await getDbContext().sharedFolderItem.findFirst({
      where: { folderId },
      orderBy: { sortOrder: 'desc' },
    });
    const nextOrder = (lastItem?.sortOrder ?? -1) + 1;

    return await getDbContext().sharedFolderItem.create({
      data: {
        folderId,
        artifactId,
        sortOrder: nextOrder,
      },
    });
  }

  /**
   * Removes an item from a shared folder. Only the folder owner may remove items.
   */
  async removeItemFromSharedFolder(
    folderId: string,
    itemId: string,
    requestingUser: User,
  ): Promise<boolean> {
    const folder = await getDbContext().sharedFolder.findUnique({
      where: { id: folderId },
      select: { ownerId: true },
    });
    if (!folder) throw new Error('Folder not found');
    if (folder.ownerId !== requestingUser.id) {
      throw new Error('Only the folder owner can remove items');
    }

    const item = await getDbContext().sharedFolderItem.findUnique({
      where: { id: itemId },
    });
    if (!item) return false;

    await getDbContext().sharedFolderItem.delete({ where: { id: itemId } });
    return true;
  }

  // ── Payload publishing helpers ────────────────────────────────────

  /**
   * Marks a shared chat as published to Payload.
   */
  async markChatPublishedToPayload(id: string): Promise<void> {
    await getDbContext().sharedChat.update({
      where: { id },
      data: { publishedToPayload: true },
    });
  }

  /**
   * Marks a shared artifact as published to Payload.
   */
  async markArtifactPublishedToPayload(id: string): Promise<void> {
    await getDbContext().sharedArtifact.update({
      where: { id },
      data: { publishedToPayload: true },
    });
  }

  /**
   * Marks a shared folder as published to Payload.
   */
  async markFolderPublishedToPayload(id: string): Promise<void> {
    await getDbContext().sharedFolder.update({
      where: { id },
      data: { publishedToPayload: true },
    });
  }

  /**
   * Returns all published (not yet on Payload) content for Payload to pull.
   * Fetch-based integration: Payload calls this endpoint to discover new content.
   */
  async getPayloadContent(): Promise<{
    chats: SharedChat[];
    artifacts: SharedArtifact[];
    folders: (SharedFolder & { items: (SharedFolderItem & { artifact: SharedArtifact })[] })[];
  }> {
    const [chats, artifacts, folders] = await Promise.all([
      getDbContext().sharedChat.findMany({
        where: { publishedToPayload: false, visibility: 'PUBLIC' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      getDbContext().sharedArtifact.findMany({
        where: { publishedToPayload: false, visibility: 'PUBLIC' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      getDbContext().sharedFolder.findMany({
        where: { publishedToPayload: false, visibility: 'PUBLIC' },
        include: {
          items: { include: { artifact: true }, orderBy: { sortOrder: 'asc' } },
          owner: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { chats, artifacts, folders };
  }
}
