import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../store";

export interface BalanceState {
  balance: number;
  globalBalance: number;
  lastUpdated: string;
  isLoading: boolean;
  error: string | null;
}

const initialState: BalanceState = {
  balance: 0,
  globalBalance: 0,
  lastUpdated: "",
  isLoading: false,
  error: null,
};

const balanceSlice = createSlice({
  name: "balance",
  initialState,
  reducers: {
    setBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
      state.lastUpdated = new Date().toISOString();
      state.error = null;
    },
    setGlobalBalance: (state, action: PayloadAction<number>) => {
      state.globalBalance = action.payload;
      state.lastUpdated = new Date().toISOString();
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const { setBalance, setGlobalBalance, setLoading, setError } =
  balanceSlice.actions;
export const selectBalance = (state: RootState) => state.balance;
export const selectHasFunds = (state: RootState) =>
  state.balance.balance > 0 || state.balance.globalBalance > 0;
export default balanceSlice.reducer;
