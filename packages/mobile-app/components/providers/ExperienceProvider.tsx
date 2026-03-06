import React, { createContext, useContext } from 'react';
import { useExperience } from '../../hooks/useExperience';

interface ExperienceContextType {
  showLanguageInput: (forceShow?: boolean) => void;
}

const ExperienceContext = createContext<ExperienceContextType | undefined>(undefined);

export function useExperienceContext() {
  const context = useContext(ExperienceContext);
  if (context === undefined) {
    throw new Error('useExperienceContext must be used within an ExperienceProvider');
  }
  return context;
}

export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const { showLanguageInput, LanguageInputModal } = useExperience();

  return (
    <ExperienceContext.Provider value={{ showLanguageInput }}>
      {children}
      <LanguageInputModal />
    </ExperienceContext.Provider>
  );
}
