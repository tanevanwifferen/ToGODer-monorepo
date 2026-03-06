import AsyncStorage from '@react-native-async-storage/async-storage';
import { validate } from 'uuid';

const KEYS_INDEX_KEY = '@storage_keys_index';

class StorageService {
  private static instance: StorageService;
  private keysIndex: string[] = [];
  private initialized = false;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async initialize() {
    if (this.initialized) return;
    
    try {
      const storedIndex = await AsyncStorage.getItem(KEYS_INDEX_KEY);
      if (storedIndex) {
        this.keysIndex = JSON.parse(storedIndex);
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize StorageService:', error);
      throw error;
    }
  }

  private async saveIndex() {
    try {
      await AsyncStorage.setItem(KEYS_INDEX_KEY, JSON.stringify(this.keysIndex));
    } catch (error) {
      console.error('Failed to save keys index:', error);
      throw error;
    }
  }

  private validateKey(key: string): void {
    if (!key) {
      throw new Error('Key cannot be empty');
    }
    if (!key.startsWith('/')) {
      throw new Error('Key must start with /');
    }
  }

  public keyIsValid(key: string): boolean {
    try{
      this.validateKey(key);
      return true;
    }
    catch(e){
      return false;
    }
  }

  /**
   * Get a note by its key
   * @param key - The key of the note (e.g., "/goals/learn-guitar")
   * @returns The note content or null if not found
   */
  public async get(key: string): Promise<string | null> {
    await this.initialize();
    this.validateKey(key);

    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Failed to get note:', error);
      throw error;
    }
  }

  /**
   * Set a note with the given key and content
   * @param key - The key for the note (e.g., "/goals/learn-guitar")
   * @param content - The content of the note
   */
  public async set(key: string, content: string): Promise<void> {
    await this.initialize();
    this.validateKey(key);

    try {
      await AsyncStorage.setItem(key, content);
      
      if (!this.keysIndex.includes(key)) {
        this.keysIndex.push(key);
        await this.saveIndex();
      }
    } catch (error) {
      console.error('Failed to set note:', error);
      throw error;
    }
  }

  /**
   * Delete a note by its key
   * @param key - The key of the note to delete
   */
  public async delete(key: string): Promise<void> {
    await this.initialize();
    this.validateKey(key);

    try {
      await AsyncStorage.removeItem(key);
      
      const keyIndex = this.keysIndex.indexOf(key);
      if (keyIndex !== -1) {
        this.keysIndex.splice(keyIndex, 1);
        await this.saveIndex();
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  }

  /**
   * List all keys in the storage
   * @returns Array of all keys
   */
  public async listKeys(): Promise<string[]> {
    await this.initialize();
    return [...this.keysIndex];
  }

  /**
   * Clear all notes and reset the index
   * Warning: This will delete all stored notes
   */
  public async clear(): Promise<void> {
    await this.initialize();
    
    try {
      // Delete all notes
      await Promise.all(this.keysIndex.map(key => AsyncStorage.removeItem(key)));
      
      // Reset and save the index
      this.keysIndex = [];
      await AsyncStorage.removeItem(KEYS_INDEX_KEY);
      this.initialized = false;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }
}

export default StorageService.getInstance();
