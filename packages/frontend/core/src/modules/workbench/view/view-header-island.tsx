import { useService } from '@toeverything/infra';

import { ViewService } from '../services/view';

export const ViewHeaderIsland = ({ children }: React.PropsWithChildren) => {
  const view = useService(ViewService).view;
  return <view.header.Provider>{children}</view.header.Provider>;
};
