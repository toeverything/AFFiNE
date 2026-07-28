import { useThemeColorV2 } from '@affine/component';

import { MobileNavigationVirtualScroller } from '../../components/navigation';

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');

  return <MobileNavigationVirtualScroller />;
};
