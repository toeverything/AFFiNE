import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

import {
  card,
  cardContent,
  cardDesc,
  cardFooter,
  cardHeader,
  cardIcon,
  cardStatus,
  cardTitle,
} from './card.css';

export const IntegrationCard = ({
  className,
  link,
  ...props
}: HTMLAttributes<HTMLElement> & {
  link?: string;
}) => {
  return link ? (
    <a
      className={clsx(className, card)}
      {...props}
      href={link}
      target="_blank"
      rel="noreferrer"
    />
  ) : (
    <div className={clsx(className, card)} {...props} />
  );
};

export const IntegrationCardIcon = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  return <div className={clsx(cardIcon, className)} {...props} />;
};

export const IntegrationCardHeader = ({
  className,
  icon,
  title,
  status,
  ...props
}: HTMLAttributes<HTMLHeadElement> & {
  icon?: ReactNode;
  title?: string;
  status?: ReactNode;
}) => {
  return (
    <header className={clsx(cardHeader, className)} {...props}>
      <IntegrationCardIcon>{icon}</IntegrationCardIcon>
      <div>
        <div className={cardTitle}>{title}</div>
        {status ? <div className={cardStatus}>{status}</div> : null}
      </div>
    </header>
  );
};

export const IntegrationCardContent = ({
  className,
  desc,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  desc?: string;
}) => {
  return (
    <div className={clsx(cardContent, className)} {...props}>
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
