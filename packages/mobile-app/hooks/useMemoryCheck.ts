import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectPersonalData } from '../redux/slices/personalSlice';
import { useMemoryService } from './useMemoryService';

const MEMORY_SIZE_THRESHOLD = 2000;

export const useMemoryCheck = () => {
  const [isDreaming, setIsDreaming] = useState(false);
  const personalData = useSelector(selectPersonalData);
  const { compressMemory } = useMemoryService();

  useEffect(() => {
    const checkMemorySize = async () => {
      const memorySize = JSON.stringify(personalData).length;
      
      if (memorySize > MEMORY_SIZE_THRESHOLD && !isDreaming) {
        setIsDreaming(true);
        try {
          await compressMemory();
        } finally {
          setIsDreaming(false);
        }
      }
    };

    checkMemorySize();
  }, []); // Empty dependency array to run only once on mount

  return {
    isDreaming
  };
};
