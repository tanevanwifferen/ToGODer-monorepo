import { store } from "../redux/store";
import {
  addChat,
  addMessage,
  updateMessageAtIndex,
  addMemories,
  setAutoGenerateAnswer,
} from "../redux/slices/chatsSlice";
import {
  addArtifact,
  updateArtifact,
  deleteArtifact,
  moveArtifact,
  selectProjectArtifacts,
  Artifact,
} from "../redux/slices/artifactsSlice";
import {
  ChatApiClient,
  StreamEvent,
  ArtifactIndexItem,
  ArtifactToolCall,
  ToolResultEvent,
  ARTIFACT_TOOL_SCHEMAS,
  LIBRARY_TOOL_SCHEMA,
  ToolSchema,
} from "../apiClients/ChatApiClient";
import { ApiChatMessage } from "../model/ChatRequest";
import Toast from "react-native-toast-message";
import { Platform } from "react-native";
import { BalanceService } from "./BalanceService";
import StorageService from "./StorageService";
import { CalendarService } from "./CalendarService";
import { HealthService } from "./health";
import { v4 as uuidv4 } from "uuid";
import { selectIsAuthenticated } from "../redux/slices/authSlice";
import { selectHasFunds } from "../redux/slices/balanceSlice";
import { selectDefaultModel } from "../redux/slices/globalConfigSlice";

const MAX_MEMORY_FETCH_LOOPS = 4;

export interface SendMessageOptions {
  chatId: string;
  content: string;
  useStreaming?: boolean;
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
  onChunk?: (content: string) => void;
  onComplete?: (message: ApiChatMessage) => void;
  onError?: (error: string) => void;
}

export interface SendMessageStreamOptions {
  chatId: string;
  messages: ApiChatMessage[];
  memories: string[];
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
  artifactIndex?: ArtifactIndexItem[];
  tools?: typeof ARTIFACT_TOOL_SCHEMAS;
  toolCallLoopCount?: number;
  signal?: AbortSignal;
  onChunk?: (content: string) => void;
  onComplete?: (message: ApiChatMessage) => void;
  onError?: (error: string) => void;
  onToolCall?: (toolCall: ArtifactToolCall) => void;
}

const MAX_TOOL_CALL_LOOPS = 10;

/**
 * Service class for managing message operations
 * Provides centralized message sending, streaming, and notification handling
 */
export class MessageService {
  private static instance: MessageService;

  /**
   * AbortController for the currently active request.
   * Used to cancel ongoing streaming or non-streaming requests.
   */
  private currentRequestController: AbortController | null = null;

  private constructor() {}

  private async buildStaticData(): Promise<any> {
    const state = store.getState();
    const preferredLanguage = state.userSettings.language;
    let sd: any = {
      preferredLanguage,
      date: new Date().toDateString() + " " + new Date().toTimeString(),
    };
    if (Platform.OS !== "web") {
      const upcomingEventsInCalendar =
        await CalendarService.getUpcomingEvents();
      const pastEventsInCalendar = await CalendarService.getPastWeekEvents();
      const health = await HealthService.getHealthDataSummerized();
      sd = {
        ...sd,
        upcomingEventsInCalendar,
        pastEventsInCalendar,
        health,
      };
    }
    return sd;
  }

  /**
   * Cancels the currently active request if one exists.
   * This will abort any ongoing streaming or non-streaming message request.
   * @returns true if a request was cancelled, false if no request was active
   */
  public cancelCurrentRequest(): boolean {
    if (this.currentRequestController) {
      this.currentRequestController.abort();
      this.currentRequestController = null;
      return true;
    }
    return false;
  }

  /**
   * Returns whether there is currently an active request that can be cancelled.
   */
  public hasActiveRequest(): boolean {
    return this.currentRequestController !== null;
  }

  /**
   * Clears the current request controller without aborting.
   * Called internally when a request completes normally.
   */
  private clearCurrentRequest(): void {
    this.currentRequestController = null;
  }

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  /**
   * Builds the tools array based on project and library settings.
   * Includes artifact tools when chat has a project, and library tool
   * when library integration is enabled.
   */
  private buildTools(projectId: string | undefined): ToolSchema[] | undefined {
    const state = store.getState();
    const libraryEnabled = state.userSettings.libraryIntegrationEnabled;

    const tools: ToolSchema[] = [];

    if (projectId) {
      tools.push(...ARTIFACT_TOOL_SCHEMAS);
    }

    if (libraryEnabled) {
      tools.push(LIBRARY_TOOL_SCHEMA);
    }

    return tools.length > 0 ? tools : undefined;
  }

  /**
   * Fixes orphaned artifacts in a project.
   * Artifacts with parentId pointing to non-existent folders are moved to root.
   */
  private fixOrphanedArtifacts(projectId: string): void {
    const state = store.getState();
    const artifacts = selectProjectArtifacts(state, projectId);
    const artifactIds = new Set(artifacts.map((a) => a.id));

    for (const artifact of artifacts) {
      if (artifact.parentId && !artifactIds.has(artifact.parentId)) {
        // Parent doesn't exist, move to root
        console.log(
          `Fixing orphaned artifact "${artifact.name}" - moving to root`
        );
        store.dispatch(
          updateArtifact({
            id: artifact.id,
            updates: { parentId: null },
          })
        );
      }
    }
  }

  /**
   * Builds an artifact index for a project.
   * Returns array of artifacts with path, name, mimeType, and type.
   * Path is constructed from parent hierarchy.
   */
  private buildArtifactIndex(projectId: string): ArtifactIndexItem[] {
    // Fix any orphaned artifacts before building index
    this.fixOrphanedArtifacts(projectId);

    const state = store.getState();
    const artifacts = selectProjectArtifacts(state, projectId);

    // Build path for each artifact by traversing parent hierarchy
    const buildPath = (artifact: Artifact): string => {
      const parts: string[] = [artifact.name];
      let current = artifact;

      while (current.parentId) {
        const parent = state.artifacts.artifacts[current.parentId];
        if (parent) {
          parts.unshift(parent.name);
          current = parent;
        } else {
          break;
        }
      }

      return "/" + parts.join("/");
    };

    return artifacts.map((artifact) => ({
      path: buildPath(artifact),
      name: artifact.name,
      type: artifact.type,
      mimeType: artifact.type === "file" ? "text/plain" : undefined,
    }));
  }

  /**
   * Handles artifact tool calls from the AI.
   * Returns the result with artifact info for creating chat messages.
   */
  private handleArtifactToolCall(
    toolCall: ArtifactToolCall,
    projectId: string
  ): {
    message: string;
    artifactId?: string;
    artifactPath: string;
    isError: boolean;
    operation: "read" | "write" | "delete" | "move";
  } {
    const state = store.getState();
    const artifacts = selectProjectArtifacts(state, projectId);

    // Find artifact by path
    const findArtifactByPath = (path: string): Artifact | undefined => {
      const buildPath = (artifact: Artifact): string => {
        const parts: string[] = [artifact.name];
        let current = artifact;

        while (current.parentId) {
          const parent = state.artifacts.artifacts[current.parentId];
          if (parent) {
            parts.unshift(parent.name);
            current = parent;
          } else {
            break;
          }
        }

        return "/" + parts.join("/");
      };

      return artifacts.find((a) => buildPath(a) === path);
    };

    // Find parent artifact for a given path
    const findParentForPath = (
      path: string
    ): { parentId: string | null; name: string } => {
      const parts = path.split("/").filter(Boolean);
      const name = parts.pop() || "";

      if (parts.length === 0) {
        return { parentId: null, name };
      }

      const parentPath = "/" + parts.join("/");
      const parent = findArtifactByPath(parentPath);
      return { parentId: parent?.id || null, name };
    };

    // Ensure all parent folders exist for a given path, creating them if needed
    const ensureParentFoldersExist = (
      path: string
    ): { parentId: string | null; name: string } => {
      const parts = path.split("/").filter(Boolean);
      const name = parts.pop() || "";

      if (parts.length === 0) {
        return { parentId: null, name };
      }

      let currentParentId: string | null = null;
      let currentPath = "";
      // Track newly created folders by path to handle nested creation
      const createdFolders: { [path: string]: string } = {};

      // Iterate through each folder in the path
      for (const folderName of parts) {
        currentPath = currentPath + "/" + folderName;

        // Check if we just created this folder in this operation
        if (createdFolders[currentPath]) {
          currentParentId = createdFolders[currentPath];
          continue;
        }

        const existingFolder = findArtifactByPath(currentPath);

        if (existingFolder) {
          // Folder already exists, use it as the parent for next level
          currentParentId = existingFolder.id;
        } else {
          // Folder doesn't exist, create it
          const newFolderId = uuidv4();
          store.dispatch(
            addArtifact({
              id: newFolderId,
              projectId,
              name: folderName,
              type: "folder",
              parentId: currentParentId,
            })
          );
          createdFolders[currentPath] = newFolderId;
          currentParentId = newFolderId;
        }
      }

      return { parentId: currentParentId, name };
    };

    const path = toolCall.arguments.path;

    switch (toolCall.name) {
      case "read_artifact": {
        const artifact = findArtifactByPath(path);
        if (!artifact) {
          return {
            message: `Artifact not found at path "${path}"`,
            artifactPath: path,
            isError: true,
            operation: "read" as const,
          };
        }
        if (artifact.type === "folder") {
          // Return folder contents listing
          const children = artifacts.filter((a) => a.parentId === artifact.id);
          const listing = children
            .map((c) => `${c.type === "folder" ? "[folder] " : ""}${c.name}`)
            .join("\n");
          return {
            message: `Folder contents of "${path}":\n${listing || "(empty)"}`,
            artifactId: artifact.id,
            artifactPath: path,
            isError: false,
            operation: "read" as const,
          };
        }
        return {
          message: artifact.content || "",
          artifactId: artifact.id,
          artifactPath: path,
          isError: false,
          operation: "read" as const,
        };
      }

      case "write_artifact": {
        const existing = findArtifactByPath(path);
        if (existing) {
          // Update existing artifact
          store.dispatch(
            updateArtifact({
              id: existing.id,
              updates: {
                content: toolCall.arguments.content,
                name: toolCall.arguments.name || existing.name,
              },
            })
          );
          return {
            message: `Updated artifact "${path}"`,
            artifactId: existing.id,
            artifactPath: path,
            isError: false,
            operation: "write" as const,
          };
        } else {
          // Create new artifact, ensuring parent folders exist
          const { parentId, name } = ensureParentFoldersExist(path);
          const newId = uuidv4();
          store.dispatch(
            addArtifact({
              id: newId,
              projectId,
              name: toolCall.arguments.name || name,
              type: "file",
              parentId,
              content: toolCall.arguments.content,
            })
          );
          return {
            message: `Created artifact "${path}"`,
            artifactId: newId,
            artifactPath: path,
            isError: false,
            operation: "write" as const,
          };
        }
      }

      case "delete_artifact": {
        const artifact = findArtifactByPath(path);
        if (!artifact) {
          return {
            message: `Artifact not found at path "${path}"`,
            artifactPath: path,
            isError: true,
            operation: "delete" as const,
          };
        }
        const deletedId = artifact.id;
        store.dispatch(deleteArtifact(deletedId));
        return {
          message: `Deleted artifact "${path}"`,
          artifactId: deletedId,
          artifactPath: path,
          isError: false,
          operation: "delete" as const,
        };
      }

      case "move_artifact": {
        const artifact = findArtifactByPath(path);
        if (!artifact) {
          return {
            message: `Artifact not found at path "${path}"`,
            artifactPath: path,
            isError: true,
            operation: "move" as const,
          };
        }

        const destination = toolCall.arguments.destination;
        if (!destination) {
          return {
            message: `Destination path is required`,
            artifactPath: path,
            isError: true,
            operation: "move" as const,
          };
        }

        // Determine the new parent
        let newParentId: string | null = null;
        if (destination !== "/") {
          const destArtifact = findArtifactByPath(destination);
          if (!destArtifact) {
            return {
              message: `Destination folder not found at path "${destination}"`,
              artifactPath: path,
              isError: true,
              operation: "move" as const,
            };
          }
          if (destArtifact.type !== "folder") {
            return {
              message: `Destination "${destination}" is not a folder`,
              artifactPath: path,
              isError: true,
              operation: "move" as const,
            };
          }
          // Prevent circular moves (moving folder into its own descendant)
          if (artifact.type === "folder") {
            const isDescendant = (parentId: string | null, targetId: string): boolean => {
              if (!parentId) return false;
              if (parentId === targetId) return true;
              const parent = artifacts.find((a) => a.id === parentId);
              return parent ? isDescendant(parent.parentId, targetId) : false;
            };
            if (destArtifact.id === artifact.id || isDescendant(destArtifact.parentId, artifact.id)) {
              return {
                message: `Cannot move folder "${path}" into itself or its descendant`,
                artifactPath: path,
                isError: true,
                operation: "move" as const,
              };
            }
          }
          newParentId = destArtifact.id;
        }

        store.dispatch(moveArtifact({ id: artifact.id, newParentId }));
        return {
          message: `Moved artifact "${path}" to "${destination}"`,
          artifactId: artifact.id,
          artifactPath: path,
          isError: false,
          operation: "move" as const,
        };
      }

      case "list_directory": {
        const depth = toolCall.arguments.depth ?? 1;

        // Helper to get children at a specific depth
        const listChildren = (parentId: string | null, currentDepth: number): Array<{name: string; type: string; id: string; path: string}> => {
          const children = artifacts.filter((a) => a.parentId === parentId);
          const result: Array<{name: string; type: string; id: string; path: string}> = [];

          for (const child of children) {
            const childPath = parentId === null
              ? `/${child.name}`
              : (() => {
                  const parts: string[] = [child.name];
                  let current = child;
                  while (current.parentId) {
                    const parent = artifacts.find((a) => a.id === current.parentId);
                    if (parent) {
                      parts.unshift(parent.name);
                      current = parent;
                    } else {
                      break;
                    }
                  }
                  return "/" + parts.join("/");
                })();

            result.push({
              name: child.name,
              type: child.type,
              id: child.id,
              path: childPath,
            });

            // Recursively get nested children if depth > 1 and this is a folder
            if (currentDepth < depth && child.type === "folder") {
              result.push(...listChildren(child.id, currentDepth + 1));
            }
          }

          return result;
        };

        // Determine the parent ID for the requested path
        let targetParentId: string | null = null;
        if (path !== "/" && path !== "") {
          const targetFolder = findArtifactByPath(path);
          if (!targetFolder) {
            return {
              message: `Directory not found at path "${path}"`,
              artifactPath: path,
              isError: true,
              operation: "read" as const,
            };
          }
          if (targetFolder.type !== "folder") {
            return {
              message: `Path "${path}" is not a directory`,
              artifactPath: path,
              isError: true,
              operation: "read" as const,
            };
          }
          targetParentId = targetFolder.id;
        }

        const contents = listChildren(targetParentId, 1);
        const listing = JSON.stringify(contents, null, 2);

        return {
          message: contents.length > 0
            ? `Directory listing for "${path}":\n${listing}`
            : `Directory "${path}" is empty`,
          artifactPath: path,
          isError: false,
          operation: "read" as const,
        };
      }

      default:
        return {
          message: `Unknown tool "${(toolCall as any).name}"`,
          artifactPath: path,
          isError: true,
          operation: "read" as const,
        };
    }
  }

  /**
   * Sends a message to a chat
   * Handles both streaming and non-streaming modes
   */
  public async sendMessage(options: SendMessageOptions): Promise<void> {
    const {
      chatId,
      content,
      useStreaming = true,
      memoryLoopCount = 0,
      memoryLoopLimitReached = false,
      onChunk,
      onComplete,
      onError,
    } = options;

    // Cancel any existing request before starting a new one
    this.cancelCurrentRequest();

    // Create a new AbortController for this request
    this.currentRequestController = new AbortController();
    const signal = this.currentRequestController.signal;

    try {
      const state = store.getState();
      const chat = state.chats.chats[chatId];

      if (!chat) {
        const error = `Chat ${chatId} not found`;
        console.error(error);
        onError?.(error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: error,
          position: "bottom",
        });
        return;
      }

      // Add user message to chat
      const userMessage: ApiChatMessage = {
        role: "user",
        content,
        timestamp: Date.now(),
      };

      store.dispatch(addMessage({ id: chatId, message: userMessage }));

      // Prevent auto-generation during manual send
      store.dispatch(setAutoGenerateAnswer(false));

      // Get updated messages after adding user message
      const updatedState = store.getState();
      const updatedChat = updatedState.chats.chats[chatId];
      const messages = updatedChat.messages;

      // Check auth and balance state for feature gating
      const isAuthenticated = selectIsAuthenticated(updatedState);
      const hasFunds = selectHasFunds(updatedState);

      // Build artifact index and tools only if authenticated
      const artifactIndex = (isAuthenticated && chat.projectId)
        ? this.buildArtifactIndex(chat.projectId)
        : undefined;
      const tools = isAuthenticated ? this.buildTools(chat.projectId) : undefined;

      // Memory is only available when authenticated and there are funds
      const memoryEnabled = isAuthenticated && hasFunds;
      const memories = memoryEnabled ? chat.memories : [];

      // Send the message and get response
      if (useStreaming) {
        await this.sendMessageWithStreaming({
          chatId,
          messages,
          memories,
          memoryLoopCount,
          memoryLoopLimitReached,
          artifactIndex,
          tools,
          signal,
          onChunk,
          onComplete,
          onError,
        });
      } else {
        await this.sendMessageWithoutStreaming({
          chatId,
          messages,
          memories,
          memoryLoopCount,
          memoryLoopLimitReached,
          artifactIndex,
          tools,
          signal,
          onComplete,
          onError,
        });
      }

      // Update balance after successful send
      const balanceService = BalanceService.getInstance();
      await balanceService.updateBalanceIfAuthenticated();
    } catch (error) {
      this.clearCurrentRequest();

      // Check if this was an intentional cancellation
      const isAborted =
        signal?.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.message === "Aborted"));

      if (isAborted) {
        console.log("MessageService: sendMessage request was cancelled");
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      console.error("MessageService.sendMessage error:", error);
      onError?.(errorMessage);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMessage,
        position: "bottom",
      });
    }
  }

  /**
   * Sends a message with streaming support
   */
  private async sendMessageWithStreaming(
    options: SendMessageStreamOptions
  ): Promise<void> {
    const {
      chatId,
      messages,
      memories,
      memoryLoopCount = 0,
      memoryLoopLimitReached = false,
      artifactIndex,
      tools,
      toolCallLoopCount = 0,
      signal,
      onChunk,
      onComplete,
      onError,
      onToolCall,
    } = options;

    const state = store.getState();
    const userSettings = state.userSettings;
    const chat = state.chats.chats[chatId];

    // When not authenticated, force the default model
    const isAuthenticated = selectIsAuthenticated(state);
    const effectiveModel = isAuthenticated
      ? userSettings.model
      : selectDefaultModel(state);

    // Resolve memory payload
    const personalData = state.personal.data;
    const configurableData =
      typeof personalData === "string"
        ? personalData
        : JSON.stringify(personalData);
    const staticData = await this.buildStaticData();
    const memoryIndex = await StorageService.listKeys();
    const resolvedMemories: Record<string, string> = {};
    for (const key of memories) {
      if (!StorageService.keyIsValid(key)) continue;
      const value = await StorageService.get(key);
      if (value != null) resolvedMemories[key] = value;
    }

    // Resolve custom system prompt and persona
    const customSystemPrompt = userSettings.customSystemPrompt;
    const useCustomPrompt =
      messages.length > 0 &&
      messages[0].content.startsWith("/custom") &&
      !!customSystemPrompt;
    const persona = state.personal.persona;

    let accumulated = "";
    let messageSignature: string | undefined;
    let assistantIndex = -1;
    let placeholderCreated = false;

    // Throttle Redux updates to avoid excessive re-renders on low-CPU devices.
    // Instead of dispatching on every chunk, we batch updates at ~60ms intervals.
    let pendingFlush = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_INTERVAL_MS = 60;

    const flushAccumulated = () => {
      flushTimer = null;
      pendingFlush = false;
      if (placeholderCreated && assistantIndex >= 0) {
        store.dispatch(
          updateMessageAtIndex({
            chatId,
            messageIndex: assistantIndex,
            content: accumulated,
          })
        );
      }
    };

    const scheduleFlush = () => {
      pendingFlush = true;
      if (flushTimer === null) {
        flushTimer = setTimeout(flushAccumulated, FLUSH_INTERVAL_MS);
      }
    };

    const cancelFlush = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    // Track tool calls and their results for chaining
    const toolCallResults: Array<{
      toolCallId: string;
      name: string;
      result: string;
      isError: boolean;
    }> = [];

    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        throw new Error("Request cancelled");
      }

      for await (const evt of ChatApiClient.sendMessageStream(
        effectiveModel,
        userSettings.humanPrompt,
        userSettings.keepGoing,
        userSettings.outsideBox,
        userSettings.holisticTherapist,
        userSettings.communicationStyle,
        messages,
        configurableData,
        staticData,
        userSettings.assistant_name,
        memoryIndex,
        resolvedMemories,
        useCustomPrompt ? customSystemPrompt : undefined,
        persona && persona.length > 0 ? persona : undefined,
        userSettings.libraryIntegrationEnabled,
        memoryLoopCount,
        memoryLoopLimitReached,
        artifactIndex,
        tools,
        signal
      )) {
        switch (evt.type) {
          case "chunk": {
            // Create placeholder on first chunk
            if (!placeholderCreated) {
              const currentState = store.getState();
              const currentChat = currentState.chats.chats[chatId];
              const preLength = currentChat.messages.length;

              store.dispatch(
                addMessage({
                  id: chatId,
                  message: {
                    role: "assistant",
                    content: "",
                    signature: undefined,
                  } as ApiChatMessage,
                })
              );
              assistantIndex = preLength;
              placeholderCreated = true;
            }

            const part = typeof evt.data === "string" ? evt.data : "";
            accumulated += part;

            scheduleFlush();

            onChunk?.(accumulated);
            break;
          }

          case "signature": {
            messageSignature = evt.data;
            if (placeholderCreated && assistantIndex >= 0) {
              store.dispatch(
                updateMessageAtIndex({
                  chatId,
                  messageIndex: assistantIndex,
                  signature: evt.data,
                })
              );
            }
            break;
          }

          case "memory_request": {
            const rawKeys = evt.data?.keys ?? [];
            const keys = rawKeys.filter((x: string) =>
              StorageService.keyIsValid(x)
            );

            store.dispatch(
              addMemories({
                id: chatId,
                memories: keys,
              })
            );

            if (memoryLoopLimitReached || memoryLoopCount >= MAX_MEMORY_FETCH_LOOPS) {
              console.warn(
                "MessageService: memory request received but fetch limit reached"
              );
              cancelFlush();
              return;
            }

            // Re-trigger send with updated memories
            const nextLoopCount = memoryLoopCount + 1;
            const nextLimitReached = nextLoopCount >= MAX_MEMORY_FETCH_LOOPS;

            const updatedState = store.getState();
            const updatedChat = updatedState.chats.chats[chatId];

            // Rebuild artifact index and include tools with fresh state
            const updatedArtifactIndex = updatedChat.projectId
              ? this.buildArtifactIndex(updatedChat.projectId)
              : undefined;
            const updatedTools = this.buildTools(updatedChat.projectId);

            await this.sendMessageWithStreaming({
              chatId,
              messages: updatedChat.messages,
              memories: updatedChat.memories,
              memoryLoopCount: nextLoopCount,
              memoryLoopLimitReached: nextLimitReached,
              artifactIndex: updatedArtifactIndex,
              tools: updatedTools,
              signal,
              onChunk,
              onComplete,
              onError,
              onToolCall,
            });
            return;
          }

          case "tool_call": {
            const toolCall = evt.data;

            // Check if this is a known frontend tool (artifact tools)
            const FRONTEND_TOOL_NAMES = [
              "read_artifact",
              "write_artifact",
              "delete_artifact",
              "move_artifact",
              "list_directory",
            ];

            if (!FRONTEND_TOOL_NAMES.includes(toolCall.name)) {
              // Not a frontend tool - backend handles execution.
              // Don't collect results; the backend will send tool_result events
              // or continue streaming text after execution.
              console.log(`Tool "${toolCall.name}" is backend-executed, skipping frontend handling`);
              break;
            }

            // Notify callback if provided
            onToolCall?.(toolCall);

            // Handle the tool call if chat is associated with a project
            if (chat?.projectId) {
              const result = this.handleArtifactToolCall(toolCall, chat.projectId);

              // Log the tool call result
              console.log(`Artifact tool call "${toolCall.name}":`, result);

              // Collect result for chaining
              toolCallResults.push({
                toolCallId: toolCall.id,
                name: toolCall.name,
                result: result.message,
                isError: result.isError,
              });

              // Add artifact operation message to chat (for write/delete, not read)
              if (result.operation !== "read") {
                const artifactMessage: ApiChatMessage = {
                  role: "assistant",
                  content: result.isError
                    ? `Error: ${result.message}`
                    : result.message,
                  timestamp: Date.now(),
                  hidden: result.isError,
                  artifactId: result.isError ? undefined : result.artifactId,
                };
                store.dispatch(addMessage({ id: chatId, message: artifactMessage }));
              }
            }
            break;
          }

          case "tool_result": {
            // Backend-executed tool result - log for visibility
            const toolResult = evt.data as ToolResultEvent;
            console.log(`Backend tool result for "${toolResult.name}":`, toolResult.is_error ? "error" : "success");
            break;
          }

          case "error": {
            cancelFlush();
            if (pendingFlush) flushAccumulated();

            const errorMsg =
              typeof evt.data === "string"
                ? evt.data
                : evt.data?.message ?? "Streaming error occurred";

            console.error("Streaming error:", evt.data);
            onError?.(errorMsg);
            Toast.show({
              type: "error",
              text1: "Error",
              text2: errorMsg,
              position: "bottom",
            });
            return;
          }

          case "done": {
            break;
          }
        }
      }

      // Flush any remaining throttled content to Redux
      cancelFlush();
      if (pendingFlush) flushAccumulated();

      // If there were tool calls, send results back to AI for chaining
      if (toolCallResults.length > 0 && toolCallLoopCount < MAX_TOOL_CALL_LOOPS) {
        // Create proper tool messages for each result
        for (const result of toolCallResults) {
          const toolResultMessage: ApiChatMessage = {
            role: "tool",
            content: result.isError ? `Error: ${result.result}` : result.result,
            tool_call_id: result.toolCallId,
            timestamp: Date.now(),
            hidden: true,
          };

          // Add to chat history
          store.dispatch(addMessage({ id: chatId, message: toolResultMessage }));
        }

        // Get updated state with new messages
        const updatedState = store.getState();
        const updatedChat = updatedState.chats.chats[chatId];

        // Rebuild artifact index with fresh state
        const updatedArtifactIndex = updatedChat.projectId
          ? this.buildArtifactIndex(updatedChat.projectId)
          : undefined;

        // Build tools if project has artifacts
        const updatedTools = this.buildTools(updatedChat.projectId);

        // Continue the conversation with tool results
        console.log(`Tool call loop ${toolCallLoopCount + 1}: sending ${toolCallResults.length} results back to AI`);

        await this.sendMessageWithStreaming({
          chatId,
          messages: updatedChat.messages,
          memories: updatedChat.memories,
          memoryLoopCount,
          memoryLoopLimitReached,
          artifactIndex: updatedArtifactIndex,
          tools: updatedTools,
          toolCallLoopCount: toolCallLoopCount + 1,
          signal,
          onChunk,
          onComplete,
          onError,
          onToolCall,
        });
        return;
      }

      // Stream completed successfully - always call onComplete to stop typing indicator
      this.clearCurrentRequest();
      if (onComplete) {
        const assistantMessage: ApiChatMessage = {
          role: "assistant",
          content: accumulated,
          signature: messageSignature,
          timestamp: Date.now(),
        };
        onComplete(assistantMessage);
      }
    } catch (error) {
      cancelFlush();
      this.clearCurrentRequest();

      // Check if this was an intentional cancellation
      const isAborted =
        signal?.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.message === "Aborted"));

      if (isAborted) {
        // Request was cancelled intentionally - don't show error toast
        console.log("MessageService: Request was cancelled");
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Streaming failed";
      console.error("MessageService.sendMessageWithStreaming error:", error);
      onError?.(errorMessage);
      Toast.show({
        type: "error",
        text1: "Streaming Error",
        text2: errorMessage,
        position: "bottom",
      });
    }
  }

  /**
   * Sends a message without streaming (fallback)
   */
  private async sendMessageWithoutStreaming(
    options: Omit<SendMessageStreamOptions, "onChunk">
  ): Promise<void> {
    const {
      chatId,
      messages,
      memories,
      memoryLoopCount = 0,
      memoryLoopLimitReached = false,
      artifactIndex,
      tools,
      signal,
      onComplete,
      onError,
    } = options;

    const state = store.getState();
    const userSettings = state.userSettings;

    // When not authenticated, force the default model
    const isAuthenticated = selectIsAuthenticated(state);
    const effectiveModel = isAuthenticated
      ? userSettings.model
      : selectDefaultModel(state);

    // Resolve memory payload
    const personalData = state.personal.data;
    const configurableData =
      typeof personalData === "string"
        ? personalData
        : JSON.stringify(personalData);
    const staticData = await this.buildStaticData();
    const memoryIndex = await StorageService.listKeys();
    const resolvedMemories: Record<string, string> = {};
    for (const key of memories) {
      if (!StorageService.keyIsValid(key)) continue;
      const value = await StorageService.get(key);
      if (value != null) resolvedMemories[key] = value;
    }

    // Resolve custom system prompt and persona
    const customSystemPrompt = userSettings.customSystemPrompt;
    const useCustomPrompt =
      messages.length > 0 &&
      messages[0].content.startsWith("/custom") &&
      !!customSystemPrompt;
    const persona = state.personal.persona;

    // Check if already cancelled before making request
    if (signal?.aborted) {
      console.log("MessageService: Request was cancelled before sending");
      return;
    }

    try {
      const response = await ChatApiClient.sendMessage(
        effectiveModel,
        userSettings.humanPrompt,
        userSettings.keepGoing,
        userSettings.outsideBox,
        userSettings.holisticTherapist,
        userSettings.communicationStyle,
        messages,
        configurableData,
        staticData,
        userSettings.assistant_name,
        memoryIndex,
        resolvedMemories,
        useCustomPrompt ? customSystemPrompt : undefined,
        persona && persona.length > 0 ? persona : undefined,
        userSettings.libraryIntegrationEnabled,
        memoryLoopCount,
        memoryLoopLimitReached,
        artifactIndex,
        tools
      );

      if ("requestForMemory" in response) {
        let keys = (response.requestForMemory as any).keys as string[];
        keys = keys.filter((x) => StorageService.keyIsValid(x));

        store.dispatch(
          addMemories({
            id: chatId,
            memories: keys,
          })
        );

        if (memoryLoopLimitReached || memoryLoopCount >= MAX_MEMORY_FETCH_LOOPS) {
          console.warn(
            "MessageService: non-streaming memory request ignored - limit reached"
          );
          return;
        }

        const nextLoopCount = memoryLoopCount + 1;
        const nextLimitReached = nextLoopCount >= MAX_MEMORY_FETCH_LOOPS;

        const updatedState = store.getState();
        const updatedChat = updatedState.chats.chats[chatId];

        // Rebuild artifact index and tools with fresh state
        const updatedArtifactIndex = updatedChat.projectId
          ? this.buildArtifactIndex(updatedChat.projectId)
          : undefined;
        const updatedTools = this.buildTools(updatedChat.projectId);

        await this.sendMessageWithoutStreaming({
          chatId,
          messages: updatedChat.messages,
          memories: updatedChat.memories,
          memoryLoopCount: nextLoopCount,
          memoryLoopLimitReached: nextLimitReached,
          artifactIndex: updatedArtifactIndex,
          tools: updatedTools,
          onComplete,
          onError,
        });
        return;
      }

      // Check if cancelled while waiting for response
      if (signal?.aborted) {
        console.log("MessageService: Request was cancelled while waiting");
        this.clearCurrentRequest();
        return;
      }

      // Regular response
      this.clearCurrentRequest();
      const assistantMessage: ApiChatMessage = {
        role: "assistant",
        content: response.content,
        signature: response.signature,
        timestamp: Date.now(),
      };

      store.dispatch(addMessage({ id: chatId, message: assistantMessage }));

      onComplete?.(assistantMessage);
    } catch (error) {
      this.clearCurrentRequest();

      // Check if this was an intentional cancellation
      const isAborted =
        signal?.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.message === "Aborted"));

      if (isAborted) {
        console.log("MessageService: Non-streaming request was cancelled");
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      console.error("MessageService.sendMessageWithoutStreaming error:", error);
      onError?.(errorMessage);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMessage,
        position: "bottom",
      });
    }
  }

  /**
   * Regenerates an AI response for the current conversation.
   * Used after editing a message - doesn't add a new user message,
   * just sends the current messages to get a new response.
   */
  public async regenerateResponse(options: {
    chatId: string;
    useStreaming?: boolean;
    onChunk?: (content: string) => void;
    onComplete?: (message: ApiChatMessage) => void;
    onError?: (error: string) => void;
  }): Promise<void> {
    const {
      chatId,
      useStreaming = true,
      onChunk,
      onComplete,
      onError,
    } = options;

    // Cancel any existing request before starting a new one
    this.cancelCurrentRequest();

    // Create a new AbortController for this request
    this.currentRequestController = new AbortController();
    const signal = this.currentRequestController.signal;

    try {
      const state = store.getState();
      const chat = state.chats.chats[chatId];

      if (!chat) {
        const error = `Chat ${chatId} not found`;
        console.error(error);
        onError?.(error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: error,
          position: "bottom",
        });
        return;
      }

      // Prevent auto-generation during manual regeneration
      store.dispatch(setAutoGenerateAnswer(false));

      // Use current messages from the chat
      const messages = chat.messages;

      // Check auth and balance state for feature gating
      const isAuthenticated = selectIsAuthenticated(state);
      const hasFunds = selectHasFunds(state);

      // Memory is only available when authenticated and there are funds
      const memoryEnabled = isAuthenticated && hasFunds;
      const memories = memoryEnabled ? chat.memories : [];

      // Build artifact index and tools only if authenticated
      const artifactIndex = (isAuthenticated && chat.projectId)
        ? this.buildArtifactIndex(chat.projectId)
        : undefined;
      const tools = isAuthenticated ? this.buildTools(chat.projectId) : undefined;

      // Send the message and get response
      if (useStreaming) {
        await this.sendMessageWithStreaming({
          chatId,
          messages,
          memories,
          artifactIndex,
          tools,
          signal,
          onChunk,
          onComplete,
          onError,
        });
      } else {
        await this.sendMessageWithoutStreaming({
          chatId,
          messages,
          memories,
          artifactIndex,
          tools,
          signal,
          onComplete,
          onError,
        });
      }

      // Update balance after successful send
      const balanceService = BalanceService.getInstance();
      await balanceService.updateBalanceIfAuthenticated();
    } catch (error) {
      this.clearCurrentRequest();

      // Check if this was an intentional cancellation
      const isAborted =
        signal?.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.message === "Aborted"));

      if (isAborted) {
        console.log("MessageService: regenerateResponse request was cancelled");
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to regenerate response";
      console.error("MessageService.regenerateResponse error:", error);
      onError?.(errorMessage);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMessage,
        position: "bottom",
      });
    }
  }

  /**
   * Creates a new chat
   */
  public createChat(chatId: string, title?: string): void {
    store.dispatch(
      addChat({
        id: chatId,
        title,
        messages: [],
        memories: [],
      })
    );
  }

  /**
   * Gets all messages for a specific chat
   */
  public getChatMessages(chatId: string): ApiChatMessage[] {
    const state = store.getState();
    const chat = state.chats.chats[chatId];
    return chat?.messages ?? [];
  }

  /**
   * Checks if a chat exists
   */
  public chatExists(chatId: string): boolean {
    const state = store.getState();
    return !!state.chats.chats[chatId];
  }

  /**
   * Shows a notification for a new message
   */
  public showMessageNotification(
    title: string,
    message: string,
    type: "success" | "error" | "info" = "info"
  ): void {
    Toast.show({
      type,
      text1: title,
      text2: message,
      position: "bottom",
      visibilityTime: 3000,
    });
  }
}
