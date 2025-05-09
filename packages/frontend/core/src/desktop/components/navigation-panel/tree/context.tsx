import React from 'react';

export interface NavigationPanelTreeContextData {
  /**
   * The level of the current tree node.
   */
  level: number;
}

export const NavigationPanelTreeContext =
  React.createContext<NavigationPanelTreeContextData | null>(null);
