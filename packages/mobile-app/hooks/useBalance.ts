import { useSelector } from "react-redux";
import { selectBalance } from "../redux/slices/balanceSlice";
import { BalanceService } from "../services/BalanceService";

export const useBalance = () => {
  const balanceState = useSelector(selectBalance);
  const balanceService = BalanceService.getInstance();

  return {
    balance: balanceState.balance,
    globalBalance: balanceState.globalBalance,
    isLoading: balanceState.isLoading,
    error: balanceState.error,
    fetchBalance: balanceService.fetchBalance.bind(balanceService),
    updateBalanceIfAuthenticated:
      balanceService.updateBalanceIfAuthenticated.bind(balanceService),
  };
};
