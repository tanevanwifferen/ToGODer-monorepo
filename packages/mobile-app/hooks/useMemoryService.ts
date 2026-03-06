import { useSelector } from "react-redux";
import {
  selectPersonalData,
  setPersonalData,
} from "../redux/slices/personalSlice";
import { selectHasFunds } from "../redux/slices/balanceSlice";
import StorageService from "../services/StorageService";
import { MemoryApiClient } from "../apiClients/MemoryApiClient";
import { useState } from "react";
import { MemoryCompressiontResponse } from "../model/MemoryRequest";
import { useAuth } from "./useAuth";
import { store } from "../redux";

export const useMemoryService = () => {
  const [isCompressing, setIsCompressing] = useState(false);
  const personalData = useSelector(selectPersonalData);
  const { isAuthenticated } = useAuth();
  const hasFunds = useSelector(selectHasFunds);

  const compressMemory =
    async (): Promise<MemoryCompressiontResponse | null> => {
      if (!isAuthenticated || !hasFunds) {
        return null;
      }
      try {
        setIsCompressing(true);

        // Convert personal data to string array for short term memory
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

        console.log("Compressed memory:", compressedMemory);

        // Store compressed memories
        await Promise.all(
          Object.entries(compressedMemory.longTermMemory).map(
            ([key, value]) => {
              if (
                value == "" ||
                value == null ||
                value == "null" ||
                !/a-zA-Z/.test(value)
              ){
                StorageService.delete(key);
              }
              StorageService.set(key, value);
            }
          )
        );
        store.dispatch(setPersonalData(compressedMemory.shortTermMemory));

        return compressedMemory;
      } catch (error) {
        console.error("Error compressing memory:", error);
        return null;
      } finally {
        setIsCompressing(false);
      }
    };

  return {
    compressMemory,
    isCompressing,
  };
};
