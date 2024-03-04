import { createContext, useContext } from 'react';

import type { View } from '../entities/view';

export const ViewContext = createContext<View | null>(null);

export const useView = () => {
  const view = useContext(ViewContext);
  if (!view) {
    throw new Error(
      'No view found in context. Make sure you are rendering inside a ViewRoot.'
    );
  }
  return view;
};
