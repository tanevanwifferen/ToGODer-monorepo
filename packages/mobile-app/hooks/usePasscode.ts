import { useEffect, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectPasscode, selectIsLocked, lockApp, clearPasscode } from '../redux/slices/passcodeSlice';
import { selectIsAuthenticated } from '@/redux/slices/authSlice';

export function usePasscode() {
  const dispatch = useDispatch();
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const passcode = useSelector(selectPasscode);
  const isLocked = useSelector(selectIsLocked);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Show passcode setup modal when user logs in and hasn't set a passcode
  useEffect(() => {
    if (isAuthenticated && !passcode) {
      setShowPasscodeModal(true);
    }
  }, [isAuthenticated, passcode]);

  // Lock app when going to background if passcode is set
  useEffect(() => {
    if (passcode) {
      const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
        if (nextAppState === 'background') {
          dispatch(lockApp());
        }
      });

      return () => {
        subscription.remove();
      };
    }
  }, [passcode, dispatch]);

  const resetPasscode = () => {
    if(Platform.OS === 'web') return;
    dispatch(clearPasscode());
    setShowPasscodeModal(true);
  };

  return {
    showPasscodeModal,
    setShowPasscodeModal,
    isLocked,
    hasPasscode: !!passcode,
    resetPasscode,
  };
}
