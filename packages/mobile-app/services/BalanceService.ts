import { store } from "../redux/store";
import {
  setBalance,
  setGlobalBalance,
  setLoading,
  setError,
} from "../redux/slices/balanceSlice";
import { GlobalApiClient } from "../apiClients/GlobalApiClient";
import Toast from "react-native-toast-message";
import { selectIsAuthenticated } from "@/redux/slices/authSlice";

export class BalanceService {
  private static instance: BalanceService;

  private constructor() {}

  public static getInstance(): BalanceService {
    if (!BalanceService.instance) {
      BalanceService.instance = new BalanceService();
    }
    return BalanceService.instance;
  }

  public async fetchBalance(): Promise<void> {
    try {
      store.dispatch(setLoading(true));
      const oldBalance = store.getState().balance.balance;
      const donationOptions = store.getState().globalConfig.donateOptions;
      const response = await GlobalApiClient.getBalance();
      const newBalance = response.balance;

      store.dispatch(setBalance(newBalance));
      store.dispatch(setGlobalBalance(response.globalBalance));

      // Show donation toast if balance is negative and crossing a whole number threshold
      if (
        donationOptions.length > 0 &&
        newBalance < -1 &&
        Math.ceil(newBalance) === Math.floor(oldBalance)
      ) {
        Toast.show({
          type: "info",
          text1: "Support ToGODer",
          text2: `You have used $${Math.abs(newBalance).toFixed(
            2
          )}, please consider topping up by donating on ko-fi to keep the application online and free for everybody`,
          position: "bottom",
          visibilityTime: 4000,
        });
      }
    } catch (error) {
      store.dispatch(
        setError(
          error instanceof Error ? error.message : "Failed to fetch balance"
        )
      );
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  public async updateBalanceIfAuthenticated(): Promise<void> {
    const state = store.getState();
    const isAuthenticated = selectIsAuthenticated(state);
    if (isAuthenticated) {
      await this.fetchBalance();
    }
  }
}
