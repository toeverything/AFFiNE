import * as Avatar from '@radix-ui/react-avatar';
import clsx from 'clsx';
import type { CSSProperties, FC } from 'react';

import * as style from './style.css';

export type UserAvatar = {
  size?: number;
  url?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
};

export const UserAvatar: FC<UserAvatar> = ({
  size = 20,
  style: propsStyles = {},
  url,
  name,
  className,
}) => {
  return (
    <Avatar.Root
      style={{
        width: size,
        height: size,
        ...propsStyles,
      }}
      className={clsx(style.avatarRoot, className)}
    >
      <Avatar.Image className={style.avatarImage} src={url} alt={name} />
      <Avatar.Fallback className={style.avatarFallback} delayMs={600}>
        {name?.slice(0, 1) || 'A'}
      </Avatar.Fallback>
    </Avatar.Root>
  );
};
