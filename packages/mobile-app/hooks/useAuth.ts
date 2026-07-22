import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AuthApiClient } from "../apiClients/AuthApiClient";
import { GlobalApiClient } from "../apiClients/GlobalApiClient";
import { setAuthData, clearAuth } from "../redux/slices/authSlice";
import { setBalance, setGlobalBalance } from "../redux/slices/balanceSlice";
import { clearAllChats } from "../redux/slices/chatsSlice";
import { clearPasscode } from "../redux/slices/passcodeSlice";
import { selectOldDefaultModel } from "../redux/slices/globalConfigSlice";
import { updateSettings } from "../redux/slices/userSettingsSlice";
import { store } from "../redux/store";
import CustomAlert from "@/components/ui/CustomAlert";
import { AuthService } from "@/services/AuthService";

export const useAuth = () => {
  const auth = useSelector((state: any) => state.auth);
  const dispatch = useDispatch();
  const [email, setEmail] = useState(auth?.email || "");
  const [password, setPassword] = useState(auth?.password || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth?.email) setEmail(auth.email);
    if (auth?.password) setPassword(auth.password);
  }, [auth]);

  const handleLogin = async () => {
    try {
      setError("");
      const response = await AuthApiClient.login(email, password);
      dispatch(setAuthData({ email, password, ...response }));
      // Store credentials in AuthService for re-authentication
      AuthService.storeCredentials(email, password);
      // Switch to DeepSeek V4 Pro if the user was on the guest default
      const oldDefaultModel = selectOldDefaultModel(store.getState());
      const currentModel = store.getState().userSettings.model;
      if (
        oldDefaultModel &&
        (!currentModel || currentModel === oldDefaultModel)
      ) {
        dispatch(
          updateSettings({
            model: "deepseek/deepseek-v4-pro",
          })
        );
      }
      const balanceResponse = await GlobalApiClient.getBalance();
      dispatch(setBalance(balanceResponse.balance));
      dispatch(setGlobalBalance(balanceResponse.globalBalance));
      if (!response.token) {
        setError(response as unknown as string);
        return false;
      }
      return true;
    } catch (err: any) {
      setError(err);
      return false;
    }
  };

  const handleLogout = () => {
    return new Promise<boolean>((resolve) => {
      CustomAlert.alert(
        "Confirm Logout",
        "For privacy reason logging out will delete all your " +
          "chats and they cannot be recovered. Are you sure you " +
          "want to proceed?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Logout",
            style: "destructive",
            onPress: async () => {
              try {
                setError("");
                // Invalidate the token server-side first
                try {
                  await AuthApiClient.logout();
                } catch (e) {
                  // Proceed with client-side cleanup even if the server call fails
                  console.error('Server-side logout failed, continuing with local cleanup:', e);
                }
                dispatch(clearAllChats());
                dispatch(clearPasscode());
                // Clear stored credentials from AuthService
                AuthService.clearStoredCredentials();
                // Stop token refresh to prevent re-authentication attempts
                AuthService.stopAuthServices();
                dispatch(clearAuth());
                resolve(true);
              } catch (err: any) {
                setError(err);
                resolve(false);
              }
            },
          },
        ]
      );
    });
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    isAuthenticated: !!auth?.token,
    handleLogin,
    handleLogout,
  };
};
