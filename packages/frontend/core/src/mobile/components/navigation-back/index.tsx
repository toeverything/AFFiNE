import {
  IconButton,
  type IconButtonProps,
  useIsInsideModal,
} from '@affine/component';
import { ArrowLeftSmallIcon, CloseIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { MobileBackCoordinator } from '../../modules/back-coordinator';

export interface NavigationBackButtonProps extends IconButtonProps {
  backAction?: () => void;
}

/**
 * A button to control the back behavior of the mobile app, as well as manage navigation gesture
 */
export const NavigationBackButton = ({
  icon,
  backAction,
  children,
  style: propsStyle,
  ...otherProps
}: NavigationBackButtonProps) => {
  const backCoordinator = useService(MobileBackCoordinator);
  const isInsideModal = useIsInsideModal();

  const handleRouteBack = useCallback(() => {
    if (backAction) return backAction();
    if (!backCoordinator.request('ui-back')) {
      backCoordinator.request('ui-up');
    }
  }, [backAction, backCoordinator]);

  const style = useMemo(() => ({ padding: 10, ...propsStyle }), [propsStyle]);

  if (children) return children;

  return (
    <IconButton
      size={24}
      style={style}
      onClick={handleRouteBack}
      icon={icon ?? (isInsideModal ? <CloseIcon /> : <ArrowLeftSmallIcon />)}
      data-testid="page-header-back"
      {...otherProps}
    />
  );
};
