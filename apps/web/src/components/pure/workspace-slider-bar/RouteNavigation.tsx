import { IconButton } from '@affine/component';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';

import { StyledRouteNavigationWrapper } from './shared-styles';

export const RouteNavigation = () => {
  if (!environment.isDesktop) {
    return <></>;
  }
  return (
    <StyledRouteNavigationWrapper>
      <IconButton
        size="middle"
        onClick={() => {
          window.history.back();
        }}
      >
        <ArrowLeftSmallIcon />
      </IconButton>
      <IconButton
        size="middle"
        onClick={() => {
          window.history.forward();
        }}
        style={{ marginLeft: '32px' }}
      >
        <ArrowRightSmallIcon />
      </IconButton>
    </StyledRouteNavigationWrapper>
  );
};
