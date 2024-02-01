import type {
  Dispatch,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SetStateAction,
} from 'react';

export type SplitViewDirection = 'horizontal';

export interface SplitPanel {
  id: string;
  percent: number;
  children: ReactNode;
}

export interface SplitPanelInternal extends SplitPanel {
  // for insert & resize
  type?: 'insert' | 'resize' | 'static';
  index?: number;
}

export interface SplitViewContextValue {
  panels?: SplitPanel[];
  setPanels?: Dispatch<SetStateAction<SplitPanel[]>>;
  dragging?: boolean;
  setDragging?: Dispatch<SetStateAction<boolean>>;
  nodeToAppend?: ReactNode;
  setNodeToAppend?: Dispatch<SetStateAction<ReactNode>>;
  readyToDrop?: boolean;
  setReadyToDrop?: Dispatch<SetStateAction<boolean>>;
}
// root
export interface SplitViewRootProps
  extends HTMLAttributes<HTMLDivElement>,
    PropsWithChildren {
  /**
   * Only supports `horizontal` for now.
   * @default 'horizontal'
   */
  direction?: SplitViewDirection;

  /**
   * The maximum number of panes that can be added to the split view.
   * @default 4
   */
  limit?: number;
}

// drag trigger
export interface SplitViewTriggerProps
  extends HTMLAttributes<HTMLDivElement>,
    PropsWithChildren {
  /**
   * Customize render of the trigger when dragging.
   */
  previewRenderer?: (arg: { readyToDrop?: boolean }) => ReactNode;
  contentRenderer?: () => ReactNode;
}
