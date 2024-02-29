import { useView } from './use-view';

export const ViewHeaderIsland = ({ children }: React.PropsWithChildren) => {
  const view = useView();
  return <view.header.Provider>{children}</view.header.Provider>;
};
