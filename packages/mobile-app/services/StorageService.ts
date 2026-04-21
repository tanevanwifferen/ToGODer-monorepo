import AsyncStorage from "@react-native-async-storage/async-storage";
import { store } from "../redux/store";
import {
  deleteMemory,
  markMemoriesMigrated,
  selectMemoriesState,
  setMemory,
} from "../redux/slices/memoriesSlice";

const LEGACY_KEYS_INDEX_KEY = "@storage_keys_index";

/**
 * StorageService is the stable key->value API used by chat/message/memory
 * code. Under the hood it now routes through the Redux `memories` slice so
 * entries ride on the encrypted sync blob (LWW-merged per key, with
 * tombstones for deletions).
 *
 * A one-time migration moves existing AsyncStorage-backed entries into the
 * slice on first call, then the legacy keys index is cleared.
 */
class StorageService {
  private static instance: StorageService;
  private migrationPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private validateKey(key: string): void {
    if (!key) {
      throw new Error("Key cannot be empty");
    }
    if (!key.startsWith("/")) {
      throw new Error("Key must start with /");
    }
  }

  public keyIsValid(key: string): boolean {
    try {
      this.validateKey(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Idempotent one-time migration from the legacy AsyncStorage layout into
   * the Redux memories slice. Subsequent calls are no-ops.
   */
  private async ensureMigrated(): Promise<void> {
    const state = selectMemoriesState(store.getState() as any);
    if (state.migratedAt !== null) return;

    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        try {
          const storedIndex = await AsyncStorage.getItem(LEGACY_KEYS_INDEX_KEY);
          const keys: string[] = storedIndex ? JSON.parse(storedIndex) : [];
          const now = Date.now();

          for (const key of keys) {
            if (!this.keyIsValid(key)) continue;
            try {
              const value = await AsyncStorage.getItem(key);
              if (value == null) continue;
              // Only import if slice doesn't already have a newer entry.
              const existing = (selectMemoriesState(store.getState() as any))
                .memories[key];
              if (existing && existing.updatedAt >= now) continue;
              store.dispatch(setMemory({ key, value, updatedAt: now }));
            } catch (e) {
              console.warn("[StorageService] migrate failed for key", key, e);
            }
          }

          // Clean up legacy storage so old values can't resurface.
          await Promise.all(
            keys.map((k) => AsyncStorage.removeItem(k).catch(() => {}))
          );
          await AsyncStorage.removeItem(LEGACY_KEYS_INDEX_KEY);

          store.dispatch(markMemoriesMigrated(now));
        } catch (error) {
          console.error("[StorageService] migration error:", error);
        }
      })();
    }

    await this.migrationPromise;
  }

  public async get(key: string): Promise<string | null> {
    this.validateKey(key);
    await this.ensureMigrated();
    const entry = (selectMemoriesState(store.getState() as any)).memories[key];
    if (!entry || entry.deleted) return null;
    return entry.value;
  }

  public async set(key: string, content: string): Promise<void> {
    this.validateKey(key);
    await this.ensureMigrated();
    store.dispatch(setMemory({ key, value: content }));
  }

  public async delete(key: string): Promise<void> {
    this.validateKey(key);
    await this.ensureMigrated();
    store.dispatch(deleteMemory({ key }));
  }

  public async listKeys(): Promise<string[]> {
    await this.ensureMigrated();
    const map = (selectMemoriesState(store.getState() as any)).memories;
    return Object.entries(map)
      .filter(([, v]) => !v.deleted)
      .map(([k]) => k);
  }

  public async clear(): Promise<void> {
    await this.ensureMigrated();
    const map = (selectMemoriesState(store.getState() as any)).memories;
    for (const [key, entry] of Object.entries(map)) {
      if (!entry.deleted) {
        store.dispatch(deleteMemory({ key }));
      }
    }
  }
}

export default StorageService.getInstance();
