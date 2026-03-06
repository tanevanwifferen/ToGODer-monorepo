import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';

interface PasscodeState {
  passcode: string | null;
  isLocked: boolean;
}

const initialState: PasscodeState = {
  passcode: null,
  isLocked: false,
};

const passcodeSlice = createSlice({
  name: 'passcode',
  initialState,
  reducers: {
    setPasscode: (state, action: PayloadAction<string>) => {
      state.passcode = action.payload;
    },
    clearPasscode: (state) => {
      state.passcode = null;
      state.isLocked = false;
    },
    lockApp: (state) => {
      state.isLocked = true;
    },
    unlockApp: (state) => {
      state.isLocked = false;
    },
  },
});

export const { setPasscode, clearPasscode, lockApp, unlockApp } = passcodeSlice.actions;

export const selectPasscode = (state: RootState) => state.passcode.passcode;
export const selectIsLocked = (state: RootState) => state.passcode.isLocked;

export default passcodeSlice.reducer;
