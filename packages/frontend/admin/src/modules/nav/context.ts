import { createContext, useContext } from 'react';

interface NavContextType {
  activeTab: string;
  activeSubTab: string;
  currentModule: string;
  setActiveTab: (tab: string) => void;
  setActiveSubTab: (tab: string) => void;
  setCurrentModule: (module: string) => void;
}

export const NavContext = createContext<NavContextType | undefined>(undefined);
export const useNav = () => {
  const context = useContext(NavContext);

  if (!context) {
    throw new Error('useNav must be used within a NavProvider');
  }

  return context;
};
