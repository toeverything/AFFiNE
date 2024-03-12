import { useView } from './use-view';

export const ViewBodyIsland = ({ children }: React.PropsWithChildren) => {
  const view = useView();
  return <view.body.Provider>{children}</view.body.Provider>;
};
