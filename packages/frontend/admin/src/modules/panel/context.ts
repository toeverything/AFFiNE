import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useContext,
} from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

export type SinglePanelContextType = {
  isOpen: boolean;
  panelContent: ReactNode;
  setPanelContent: (content: ReactNode) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
};

export type RightPanelContextType = SinglePanelContextType & {
  hasDirtyChanges: boolean;
  setHasDirtyChanges: Dispatch<SetStateAction<boolean>>;
};

export interface PanelContextType {
  leftPanel: SinglePanelContextType;
  rightPanel: RightPanelContextType;
}

export type ResizablePanelProps = {
  panelRef: RefObject<ImperativePanelHandle>;
  onExpand: () => void;
  onCollapse: () => void;
};

export const PanelContext = createContext<PanelContextType | undefined>(
  undefined
);

export const usePanelContext = () => {
  const context = useContext(PanelContext);

  if (!context) {
    throw new Error('usePanelContext must be used within a PanelProvider');
  }

  return context;
};

export const useLeftPanel = () => {
  const context = usePanelContext();
  return context.leftPanel;
};

export const useRightPanel = () => {
  const context = usePanelContext();
  return context.rightPanel;
};
