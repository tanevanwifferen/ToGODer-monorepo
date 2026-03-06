import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface PersonalState {
  data: any;
  persona: string;
  updatedAt: number;
}

const initialState: PersonalState = {
  data: {
    name: "?",
    age: "?",
    gender: "?",
    location: "?",
    occupation: "?",
    goals: [
      {
        id: 1,
        goal: "get to learn how to use ToGODer",
        priority: "low",
        status: "in progress",
        steps_taken: "installed app",
      },
    ],
    likes: [],
    dislikes: [],
    friends: [],
  },
  persona: "",
  updatedAt: Date.now(),
};

const personalSlice = createSlice({
  name: "personal",
  initialState,
  reducers: {
    setPersonalData: (
      state,
      action: PayloadAction<string | Record<string, any>>
    ) => {
      state.data = action.payload;
      state.updatedAt = Date.now();
    },
    setPersona: (state, action: PayloadAction<string>) => {
      state.persona = action.payload;
      state.updatedAt = Date.now();
    },
    setPersonalFromSync: (
      state,
      action: PayloadAction<{ data: any; persona: string; updatedAt: number }>
    ) => {
      state.data = action.payload.data;
      state.persona = action.payload.persona;
      state.updatedAt = action.payload.updatedAt;
    },
  },
});

export const { setPersonalData, setPersona, setPersonalFromSync } = personalSlice.actions;

export const selectPersonalData = createSelector(
  (state: { personal: PersonalState }) => state.personal,
  (personal) => personal.data
);

export const selectPersona = createSelector(
  (state: { personal: PersonalState }) => state.personal,
  (personal) => personal.persona || ""
);

export default personalSlice.reducer;
