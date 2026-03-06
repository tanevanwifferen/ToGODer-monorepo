import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectLibraryIntegrationEnabled, setLibraryIntegrationEnabled } from '../redux/slices/userSettingsSlice';

/**
 * Hook for managing library integration settings.
 * Provides the current state and a handler to toggle library integration.
 */
export const useLibraryIntegration = () => {
  const dispatch = useDispatch();
  const libraryIntegrationEnabled = useSelector(selectLibraryIntegrationEnabled);

  const handleLibraryIntegrationToggle = useCallback(
    (value: boolean) => {
      dispatch(setLibraryIntegrationEnabled(value));
    },
    [dispatch]
  );

  return {
    libraryIntegrationEnabled,
    handleLibraryIntegrationToggle,
  };
};
