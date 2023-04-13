import { IconButton } from '@affine/component';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';

export const RouteNavigation = () => {
  if (!environment.isDesktop) {
    return <div></div>;
  }
  return (
    <div>
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
    </div>
  );
};
