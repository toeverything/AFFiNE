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
        environment.isMobileEdition ? mobileActionButton : actionButton,
        className
      )}
      contentClassName={clsx(
        environment.isMobileEdition ? mobileActionContent : actionContent,
        contentClassName
      )}
      {...props}
    />
  );
};
