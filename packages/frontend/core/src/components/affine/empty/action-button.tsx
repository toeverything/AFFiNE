import { Button, type ButtonProps } from '@affine/component';
import clsx from 'clsx';

import {
  actionButton,
  actionContent,
  mobileActionButton,
  mobileActionContent,
} from './style.css';

export const ActionButton = ({
  className,
  contentClassName,
  ...props
}: ButtonProps) => {
  return (
    <Button
      size="large"
      className={clsx(
        BUILD_CONFIG.isMobileEdition ? mobileActionButton : actionButton,
        className
      )}
      contentClassName={clsx(
        BUILD_CONFIG.isMobileEdition ? mobileActionContent : actionContent,
        contentClassName
      )}
      {...props}
    />
  );
};
