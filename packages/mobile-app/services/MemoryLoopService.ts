/**
 * Service class for managing periodic memory operations
 * Handles automatic memory compression when threshold is exceeded
 * Runs independently of UI to ensure consistent memory management
 */

import { store } from "../redux/store";
import { selectIsAuthenticated } from "../redux/slices/authSlice";
import { selectHasFunds } from "../redux/slices/balanceSlice";
import {
  selectPersonalData,
  setPersonalData,
} from "../redux/slices/personalSlice";
import StorageService from "./StorageService";
import { MemoryApiClient } from "../apiClients/MemoryApiClient";

export class MemoryLoopService {
  private static loopInterval: NodeJS.Timeout | number | null = null;
  private static isCompressing = false;

  // Check memory every 5 minutes
  private static readonly LOOP_INTERVAL = 5 * 60 * 1000;

  // Compress when memory exceeds 2000 bytes (same as useMemoryCheck)
  private static readonly MEMORY_SIZE_THRESHOLD = 2000;

  /**
   * Starts the memory loop service
   * Begins periodic memory checks and compression when needed
   */
  static startMemoryLoop(): void {
    if (this.loopInterval) {
      console.log("MemoryLoopService already running");
      return;
    }

    console.log("Starting MemoryLoopService");

    this.loopInterval = setInterval(() => {
      this.executeMemoryLoop();
    }, this.LOOP_INTERVAL);

    // Do an immediate check
    this.executeMemoryLoop();
  }

  /**
   * Stops the memory loop service
   */
  static stopMemoryLoop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
      console.log("MemoryLoopService stopped");
    }
  }

  /**
   * Executes one iteration of the memory loop
   * Checks memory size and triggers compression if needed
   */
  private static async executeMemoryLoop(): Promise<void> {
    try {
      const state = store.getState();
      const isAuthenticated = selectIsAuthenticated(state);
      const hasFunds = selectHasFunds(state);

      // Only run if authenticated and there are funds available
      if (!isAuthenticated || !hasFunds) {
        return;
      }

      // Check if compression is already in progress
      if (this.isCompressing) {
        console.log("Memory compression already in progress, skipping");
        return;
      }

      // Check if memory needs compression
      const needsCompression = await this.checkMemorySize();

      if (needsCompression) {
        console.log("Memory threshold exceeded, starting compression");
        await this.compressMemory();
      }
    } catch (error) {
      console.error("MemoryLoopService error:", error);
    }
  }

  /**
   * Checks if memory size exceeds threshold
   * Returns true if compression is needed
   */
  private static async checkMemorySize(): Promise<boolean> {
    const state = store.getState();
    const personalData = selectPersonalData(state);

    const memorySize = JSON.stringify(personalData).length;

    return memorySize > this.MEMORY_SIZE_THRESHOLD;
  }

  /**
   * Compresses memory using the API
   * Stores compressed memories back to storage and updates Redux state
   */
  private static async compressMemory(): Promise<void> {
    this.isCompressing = true;

    try {
      const state = store.getState();
      const personalData = selectPersonalData(state);

      // Get short term memory
      const shortTermMemory = personalData;

      // Get all keys from storage
      const existingKeys = await StorageService.listKeys();

      // Fetch relevant memory keys based on short term memory
      const relevantKeys = await MemoryApiClient.fetchMemoryKeys(
        shortTermMemory,
        existingKeys
      );

      // Build long term memory map from storage
      const longTermMemory: Record<string, string> = {};
      await Promise.all(
        relevantKeys.keys.map(async (key) => {
          const value = await StorageService.get(key);
          longTermMemory[key] = value || "null";
        })
      );

      // Compress memory using both short term and long term memory
      const compressedMemory = await MemoryApiClient.compressMemory(
        shortTermMemory,
        longTermMemory
      );

      console.log("Memory compressed successfully");

      // Store compressed memories
      await Promise.all(
        Object.entries(compressedMemory.longTermMemory).map(([key, value]) => {
          if (
            value === "" ||
            value == null ||
            value === "null" ||
            !/[a-zA-Z]/.test(value)
          ) {
            return StorageService.delete(key);
          }
          return StorageService.set(key, value);
        })
      );

      // Update personal data in Redux
      store.dispatch(setPersonalData(compressedMemory.shortTermMemory));
    } catch (error) {
      console.error("Error compressing memory:", error);
    } finally {
      this.isCompressing = false;
    }
  }
}
