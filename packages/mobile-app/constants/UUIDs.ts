import { v4 as uuidv4, validate as validateUUID } from 'uuid';

/**
 * UUID Version used throughout the application
 */
export const UUID_VERSION = 4;

/**
 * Entity type prefixes for UUID-based identifiers
 */
export const UUID_PREFIXES = {
  CHAT: 'chat_',
  SHARE: 'share_',
  MESSAGE: 'msg_',
  USER: 'user_',
} as const;

/**
 * Generates a new UUID v4
 * @returns A new UUID string
 */
export const generateUUID = (): string => {
  return uuidv4();
};

/**
 * Validates if a string is a valid UUID
 * @param uuid - The string to validate
 * @returns True if the string is a valid UUID
 */
export const isValidUUID = (uuid: string): boolean => {
  return validateUUID(uuid);
};

/**
 * Generates a prefixed UUID for a specific entity type
 * @param prefix - The prefix to use (from UUID_PREFIXES)
 * @returns A prefixed UUID string
 */
export const generatePrefixedUUID = (prefix: string): string => {
  return `${prefix}${generateUUID()}`;
};

/**
 * Extracts the UUID part from a prefixed UUID string
 * @param prefixedUUID - The prefixed UUID string
 * @returns The UUID part without the prefix
 */
export const extractUUID = (prefixedUUID: string): string => {
  const parts = prefixedUUID.split('_');
  return parts.length > 1 ? parts.slice(1).join('_') : prefixedUUID;
};

/**
 * Validates if a prefixed UUID string has a valid UUID part
 * @param prefixedUUID - The prefixed UUID string to validate
 * @returns True if the UUID part is valid
 */
export const isValidPrefixedUUID = (prefixedUUID: string): boolean => {
  const uuid = extractUUID(prefixedUUID);
  return isValidUUID(uuid);
};
