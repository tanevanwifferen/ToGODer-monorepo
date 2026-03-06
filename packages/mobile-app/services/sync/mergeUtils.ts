import {
  SyncPayload,
  SyncableChat,
  SyncableMessage,
  SyncablePersonal,
  SyncableUserSettings,
  SyncableProject,
  SyncableArtifact,
} from "./types";

/**
 * Merge utilities using Last-Writer-Wins (LWW) strategy
 * Higher updatedAt/timestamp wins
 *
 * Key improvements:
 * 1. Message-level merging (not just chat-level)
 * 2. Tombstone support for deletions
 * 3. Proper handling of items that exist on only one side
 * 4. Support for projects and artifacts
 */

interface Timestamped {
  updatedAt: number;
}

interface Deletable {
  deleted?: boolean;
  deletedAt?: number;
}

/**
 * Compare two timestamped objects, return the one with higher timestamp
 */
function lwwMerge<T extends Timestamped>(
  local: T | undefined,
  remote: T | undefined,
  label?: string
): T | undefined {
  if (!local && !remote) {
    console.log(`[mergeUtils] ${label || "lwwMerge"}: both null/undefined`);
    return undefined;
  }
  if (!local) {
    console.log(
      `[mergeUtils] ${
        label || "lwwMerge"
      }: local undefined, using remote (updatedAt: ${remote?.updatedAt})`
    );
    return remote;
  }
  if (!remote) {
    console.log(
      `[mergeUtils] ${
        label || "lwwMerge"
      }: remote undefined, using local (updatedAt: ${local?.updatedAt})`
    );
    return local;
  }

  const winner = local.updatedAt >= remote.updatedAt ? "local" : "remote";
  console.log(
    `[mergeUtils] ${label || "lwwMerge"}: local.updatedAt=${
      local.updatedAt
    }, remote.updatedAt=${remote.updatedAt} -> winner: ${winner}`
  );
  return local.updatedAt >= remote.updatedAt ? local : remote;
}

/**
 * Generic merge for items with tombstones (deleted/deletedAt)
 */
function mergeDeletable<T extends Timestamped & Deletable>(
  local: T | undefined,
  remote: T | undefined,
  itemId: string,
  itemType: string
): T | undefined {
  if (!local && !remote) {
    return undefined;
  }

  // Handle both deleted
  if (local?.deleted && remote?.deleted) {
    return (local.deletedAt || 0) >= (remote.deletedAt || 0) ? local : remote;
  }

  // Handle local deleted
  if (local?.deleted) {
    if (!remote) {
      return local;
    }
    if ((local.deletedAt || 0) > remote.updatedAt) {
      console.log(
        `[mergeUtils] ${itemType} ${itemId}: local deleted at ${local.deletedAt} > remote updated ${remote.updatedAt}, using deleted`
      );
      return local;
    }
    console.log(
      `[mergeUtils] ${itemType} ${itemId}: remote updated ${remote.updatedAt} >= local deleted ${local.deletedAt}, using remote`
    );
    return remote;
  }

  // Handle remote deleted
  if (remote?.deleted) {
    if (!local) {
      return remote;
    }
    if ((remote.deletedAt || 0) > local.updatedAt) {
      console.log(
        `[mergeUtils] ${itemType} ${itemId}: remote deleted at ${remote.deletedAt} > local updated ${local.updatedAt}, using deleted`
      );
      return remote;
    }
    console.log(
      `[mergeUtils] ${itemType} ${itemId}: local updated ${local.updatedAt} >= remote deleted ${remote.deletedAt}, using local`
    );
    return local;
  }

  // Neither deleted, use LWW
  if (!local) return remote;
  if (!remote) return local;
  return local.updatedAt >= remote.updatedAt ? local : remote;
}

/**
 * Merge messages at the message level using LWW strategy
 *
 * IMPORTANT: Tombstones (deleted messages) are preserved to prevent resurrection.
 * The caller should filter out deleted messages for display purposes only.
 */
export function mergeMessages(
  local: SyncableMessage[],
  remote: SyncableMessage[]
): SyncableMessage[] {
  const messageMap = new Map<string, SyncableMessage>();

  // Index all local messages (including tombstones)
  for (const msg of local) {
    messageMap.set(msg.id, msg);
  }

  // Merge with remote messages
  for (const remoteMsg of remote) {
    const localMsg = messageMap.get(remoteMsg.id);

    if (!localMsg) {
      // Remote message doesn't exist locally - ALWAYS add it, including tombstones
      // Tombstones must be preserved to prevent resurrection on other devices
      messageMap.set(remoteMsg.id, remoteMsg);
    } else {
      // Message exists on both sides, use LWW
      // Use deletedAt if present (deletion is an update), otherwise use timestamp
      const localTimestamp = localMsg.deletedAt || localMsg.timestamp;
      const remoteTimestamp = remoteMsg.deletedAt || remoteMsg.timestamp;

      if (remoteTimestamp > localTimestamp) {
        messageMap.set(remoteMsg.id, remoteMsg);
      }
    }
  }

  // Sort by timestamp, keeping tombstones for sync purposes
  // IMPORTANT: Do NOT filter out deleted messages here - tombstones must be preserved
  // for proper sync. Filter at display time instead.
  const merged = Array.from(messageMap.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const activeCount = merged.filter((m) => !m.deleted).length;
  const tombstoneCount = merged.filter((m) => m.deleted).length;
  console.log(
    `[mergeUtils] mergeMessages: local=${local.length}, remote=${remote.length}, merged=${merged.length} (${activeCount} active, ${tombstoneCount} tombstones)`
  );
  return merged;
}

/**
 * Get the effective timestamp for a chat by considering both
 * the chat-level updatedAt and the newest message timestamp.
 * This prevents older conversations from overriding younger ones
 * when chat.updatedAt doesn't reflect the latest message activity.
 */
function getEffectiveTimestamp(chat: SyncableChat): number {
  let maxMessageTimestamp = 0;
  for (const msg of chat.messages) {
    const ts = msg.deletedAt || msg.timestamp || 0;
    if (ts > maxMessageTimestamp) {
      maxMessageTimestamp = ts;
    }
  }
  return Math.max(chat.updatedAt, maxMessageTimestamp);
}

/**
 * Merge two chats at the message level
 */
export function mergeSingleChat(
  local: SyncableChat | undefined,
  remote: SyncableChat | undefined,
  chatId: string
): SyncableChat | undefined {
  if (!local && !remote) {
    return undefined;
  }

  // Handle deleted chats (tombstones)
  if (local?.deleted && remote?.deleted) {
    return (local.deletedAt || 0) >= (remote.deletedAt || 0) ? local : remote;
  }

  if (local?.deleted) {
    if (!remote) {
      return local;
    }
    const remoteEffective = getEffectiveTimestamp(remote);
    if ((local.deletedAt || 0) > remoteEffective) {
      console.log(
        `[mergeUtils] Chat ${chatId}: local deleted at ${local.deletedAt} > remote effective ${remoteEffective}, using deleted`
      );
      return local;
    }
    console.log(
      `[mergeUtils] Chat ${chatId}: remote effective ${remoteEffective} >= local deleted ${local.deletedAt}, using remote`
    );
    return remote;
  }

  if (remote?.deleted) {
    if (!local) {
      return remote;
    }
    const localEffective = getEffectiveTimestamp(local);
    if ((remote.deletedAt || 0) > localEffective) {
      console.log(
        `[mergeUtils] Chat ${chatId}: remote deleted at ${remote.deletedAt} > local effective ${localEffective}, using deleted`
      );
      return remote;
    }
    console.log(
      `[mergeUtils] Chat ${chatId}: local effective ${localEffective} >= remote deleted ${remote.deletedAt}, using local`
    );
    return local;
  }

  // Neither is deleted, merge normally
  if (!local) {
    console.log(`[mergeUtils] Chat ${chatId}: only exists remotely`);
    return remote;
  }
  if (!remote) {
    console.log(`[mergeUtils] Chat ${chatId}: only exists locally`);
    return local;
  }

  // Both exist, merge messages and metadata
  // Use effective timestamp (max of updatedAt and newest message) to pick metadata winner
  const mergedMessages = mergeMessages(local.messages, remote.messages);
  const localEffective = getEffectiveTimestamp(local);
  const remoteEffective = getEffectiveTimestamp(remote);
  const metadataWinner = localEffective >= remoteEffective ? local : remote;
  const effectiveMax = Math.max(localEffective, remoteEffective);

  const merged: SyncableChat = {
    ...metadataWinner,
    messages: mergedMessages,
    updatedAt: effectiveMax,
  };

  console.log(
    `[mergeUtils] Chat ${chatId}: merged local(${local.messages.length} msgs, effective=${localEffective}) + remote(${remote.messages.length} msgs, effective=${remoteEffective}) = ${merged.messages.length} msgs, winner=${localEffective >= remoteEffective ? "local" : "remote"}`
  );
  return merged;
}

/**
 * Merge chat records using message-level LWW strategy
 */
export function mergeChats(
  local: Record<string, SyncableChat>,
  remote: Record<string, SyncableChat>
): Record<string, SyncableChat> {
  const merged: Record<string, SyncableChat> = {};
  const allIds = new Set([...Object.keys(local), ...Object.keys(remote)]);
  console.log(`[mergeUtils] mergeChats: ${allIds.size} total unique chat IDs`);

  for (const id of allIds) {
    const mergedChat = mergeSingleChat(local[id], remote[id], id);
    if (mergedChat) {
      merged[id] = mergedChat;
    }
  }

  const activeChats = Object.values(merged).filter((c) => !c.deleted).length;
  const deletedChats = Object.values(merged).filter((c) => c.deleted).length;
  console.log(
    `[mergeUtils] mergeChats result: ${activeChats} active, ${deletedChats} deleted (tombstones)`
  );
  return merged;
}

/**
 * Merge personal data using LWW strategy
 */
export function mergePersonal(
  local: SyncablePersonal | undefined,
  remote: SyncablePersonal | undefined
): SyncablePersonal | undefined {
  return lwwMerge(local, remote, "personal");
}

/**
 * Merge user settings using LWW strategy
 */
export function mergeUserSettings(
  local: SyncableUserSettings | undefined,
  remote: SyncableUserSettings | undefined
): SyncableUserSettings | undefined {
  return lwwMerge(local, remote, "userSettings");
}

/**
 * Merge projects using LWW with tombstone support
 */
export function mergeProjects(
  local: Record<string, SyncableProject>,
  remote: Record<string, SyncableProject>
): Record<string, SyncableProject> {
  const merged: Record<string, SyncableProject> = {};
  const allIds = new Set([...Object.keys(local), ...Object.keys(remote)]);
  console.log(
    `[mergeUtils] mergeProjects: ${allIds.size} total unique project IDs`
  );

  for (const id of allIds) {
    const mergedProject = mergeDeletable(local[id], remote[id], id, "Project");
    if (mergedProject) {
      merged[id] = mergedProject;
    }
  }

  const activeProjects = Object.values(merged).filter((p) => !p.deleted).length;
  const deletedProjects = Object.values(merged).filter((p) => p.deleted).length;
  console.log(
    `[mergeUtils] mergeProjects result: ${activeProjects} active, ${deletedProjects} deleted (tombstones)`
  );
  return merged;
}

/**
 * Merge artifacts using LWW with tombstone support
 */
export function mergeArtifacts(
  local: Record<string, SyncableArtifact>,
  remote: Record<string, SyncableArtifact>
): Record<string, SyncableArtifact> {
  const merged: Record<string, SyncableArtifact> = {};
  const allIds = new Set([...Object.keys(local), ...Object.keys(remote)]);
  console.log(
    `[mergeUtils] mergeArtifacts: ${allIds.size} total unique artifact IDs`
  );

  for (const id of allIds) {
    const mergedArtifact = mergeDeletable(
      local[id],
      remote[id],
      id,
      "Artifact"
    );
    if (mergedArtifact) {
      merged[id] = mergedArtifact;
    }
  }

  const activeArtifacts = Object.values(merged).filter(
    (a) => !a.deleted
  ).length;
  const deletedArtifacts = Object.values(merged).filter(
    (a) => a.deleted
  ).length;
  console.log(
    `[mergeUtils] mergeArtifacts result: ${activeArtifacts} active, ${deletedArtifacts} deleted (tombstones)`
  );
  return merged;
}

/**
 * Merge complete sync payloads
 */
export function mergeSyncPayloads(
  local: SyncPayload,
  remote: SyncPayload
): SyncPayload {
  return {
    version: Math.max(local.version, remote.version),
    syncedAt: Date.now(),
    chats: mergeChats(local.chats, remote.chats),
    personal: mergePersonal(local.personal, remote.personal) || local.personal,
    userSettings:
      mergeUserSettings(local.userSettings, remote.userSettings) ||
      local.userSettings,
    projects: mergeProjects(local.projects || {}, remote.projects || {}),
    artifacts: mergeArtifacts(local.artifacts || {}, remote.artifacts || {}),
  };
}

/**
 * Check if local data is newer than remote
 * Checks both updatedAt AND deletedAt timestamps since deletions are also changes
 */
export function hasLocalChanges(
  local: SyncPayload,
  remoteUpdatedAt: number
): boolean {
  // Check if any chat is newer (including deletions)
  for (const chat of Object.values(local.chats)) {
    if (chat.updatedAt > remoteUpdatedAt) return true;
    if (chat.deletedAt && chat.deletedAt > remoteUpdatedAt) return true;
    for (const msg of chat.messages) {
      if (msg.timestamp > remoteUpdatedAt) return true;
      if (msg.deletedAt && msg.deletedAt > remoteUpdatedAt) return true;
    }
  }

  // Check personal data
  if (local.personal.updatedAt > remoteUpdatedAt) return true;

  // Check user settings
  if (local.userSettings.updatedAt > remoteUpdatedAt) return true;

  // Check projects (including deletions)
  if (local.projects) {
    for (const project of Object.values(local.projects)) {
      if (project.updatedAt > remoteUpdatedAt) return true;
      if (project.deletedAt && project.deletedAt > remoteUpdatedAt) return true;
    }
  }

  // Check artifacts (including deletions)
  if (local.artifacts) {
    for (const artifact of Object.values(local.artifacts)) {
      if (artifact.updatedAt > remoteUpdatedAt) return true;
      if (artifact.deletedAt && artifact.deletedAt > remoteUpdatedAt)
        return true;
    }
  }

  return false;
}
