import { useService } from '@toeverything/infra';

import { ViewService } from '../services/view';

export const ViewBodyIsland = ({ children }: React.PropsWithChildren) => {
  const view = useService(ViewService).view;
  return <view.body.Provider>{children}</view.body.Provider>;
};
