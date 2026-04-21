import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SyncableMemory } from "../../services/sync/types";

export interface MemoriesState {
  memories: Record<string, SyncableMemory>;
  // Null until the one-time migration from legacy AsyncStorage keys has run.
  migratedAt: number | null;
}

const initialState: MemoriesState = {
  memories: {},
  migratedAt: null,
};

const memoriesSlice = createSlice({
  name: "memories",
  initialState,
  reducers: {
    setMemory: (
      state,
      action: PayloadAction<{ key: string; value: string; updatedAt?: number }>
    ) => {
      const { key, value, updatedAt } = action.payload;
      state.memories[key] = {
        value,
        updatedAt: updatedAt ?? Date.now(),
      };
    },
    deleteMemory: (
      state,
      action: PayloadAction<{ key: string; deletedAt?: number }>
    ) => {
      const { key, deletedAt } = action.payload;
      const ts = deletedAt ?? Date.now();
      const existing = state.memories[key];
      state.memories[key] = {
        value: existing?.value ?? "",
        updatedAt: existing?.updatedAt ?? ts,
        deleted: true,
        deletedAt: ts,
      };
    },
    setMemoriesFromSync: (
      state,
      action: PayloadAction<Record<string, SyncableMemory>>
    ) => {
      state.memories = action.payload;
    },
    markMemoriesMigrated: (state, action: PayloadAction<number>) => {
      state.migratedAt = action.payload;
    },
  },
});

export const {
  setMemory,
  deleteMemory,
  setMemoriesFromSync,
  markMemoriesMigrated,
} = memoriesSlice.actions;

export const selectMemoriesState = (state: {
  memories: MemoriesState;
}): MemoriesState => state.memories;

export const selectMemoriesMap = createSelector(
  selectMemoriesState,
  (s) => s.memories
);

// Active (non-deleted) memories as a plain key->value map for callers that
// don't care about tombstones.
export const selectActiveMemories = createSelector(selectMemoriesMap, (map) => {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(map)) {
    if (!entry.deleted) out[key] = entry.value;
  }
  return out;
});

export const selectActiveMemoryKeys = createSelector(
  selectMemoriesMap,
  (map) =>
    Object.entries(map)
      .filter(([, v]) => !v.deleted)
      .map(([k]) => k)
);

export default memoriesSlice.reducer;
