import { IconButton, type IconButtonProps } from '@affine/component';
import { SettingsIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

import {
  card,
  cardContent,
  cardDesc,
  cardFooter,
  cardHeader,
  cardIcon,
  cardTitle,
  settingIcon,
} from './card.css';
import { spaceX } from './index.css';

export const IntegrationCard = ({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) => {
  return <li className={clsx(className, card)} {...props} />;
};

export const IntegrationCardIcon = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  return <div className={clsx(cardIcon, className)} {...props} />;
};

export const IntegrationSettingIcon = ({
  className,
  ...props
}: IconButtonProps) => {
  return (
    <IconButton
      className={className}
      icon={<SettingsIcon className={settingIcon} />}
      variant="plain"
      {...props}
    />
  );
};

export const IntegrationCardHeader = ({
  className,
  icon,
  onSettingClick,
  ...props
}: HTMLAttributes<HTMLHeadElement> & {
  onSettingClick?: () => void;
  icon?: ReactNode;
}) => {
  return (
    <header className={clsx(cardHeader, className)} {...props}>
      <IntegrationCardIcon>{icon}</IntegrationCardIcon>
      <div className={spaceX} />
      <IntegrationSettingIcon onClick={onSettingClick} />
    </header>
  );
};

export const IntegrationCardContent = ({
  className,
  title,
  desc,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string;
  desc?: string;
}) => {
  return (
    <div className={clsx(cardContent, className)} {...props}>
      <div className={cardTitle}>{title}</div>
      <div className={cardDesc}>{desc}</div>
    </div>
  );
};

export const IntegrationCardFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) => {
  return <footer className={clsx(cardFooter, className)} {...props} />;
};
