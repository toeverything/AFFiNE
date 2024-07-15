import React from 'react';

export interface ExplorerTreeContextData {
  /**
   * The level of the current tree node.
   */
  level: number;
}

export const ExplorerTreeContext =
  React.createContext<ExplorerTreeContextData | null>(null);
