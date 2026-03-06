import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AuthApiClient } from "../apiClients/AuthApiClient";
import { GlobalApiClient } from "../apiClients/GlobalApiClient";
import { setAuthData } from "../redux/slices/authSlice";
import { setBalance, setGlobalBalance } from "../redux/slices/balanceSlice";
import { clearAllChats } from "../redux/slices/chatsSlice";
import { clearPasscode } from "../redux/slices/passcodeSlice";
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
                dispatch(clearAllChats());
                dispatch(clearPasscode());
                // Clear stored credentials from AuthService
                AuthService.clearStoredCredentials();
                dispatch(
                  setAuthData({
                    email: "",
                    password: "",
                    token: "",
                    userId: null,
                  })
                );
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
