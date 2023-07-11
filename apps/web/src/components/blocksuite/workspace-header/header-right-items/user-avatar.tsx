import { Menu, MenuItem } from '@affine/component';
import { AffineLogoSBlue2_1Icon, SignOutIcon } from '@blocksuite/icons';
import type { CSSProperties } from 'react';
import { forwardRef } from 'react';

import { useCurrentUser } from '../../../../hooks/affine/use-current-user';

const EditMenu = (
  <MenuItem data-testid="editor-option-menu-favorite" icon={<SignOutIcon />}>
    Sign Out
  </MenuItem>
);

export const UserAvatar = () => {
  const user = useCurrentUser();
  return (
    <Menu
      width={276}
      content={EditMenu}
      placement="bottom"
      disablePortal={true}
      trigger="click"
    >
      <WorkspaceAvatar name={user.name} avatar={user.avatarUrl} size={24} />
    </Menu>
  );
};

interface WorkspaceAvatarProps {
  size: number;
  name?: string | null;
  avatar?: string | null;
  style?: CSSProperties;
}

export const WorkspaceAvatar = forwardRef<HTMLDivElement, WorkspaceAvatarProps>(
  function WorkspaceAvatar(props, ref) {
    const size = props.size || 20;
    const sizeStr = size + 'px';

    if (props.avatar) {
      return (
        <div
          style={{
            ...props.style,
            width: sizeStr,
            height: sizeStr,
            color: '#fff',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
          ref={ref}
        >
          <picture>
            <img
              style={{ width: sizeStr, height: sizeStr }}
              src={props.avatar}
              alt=""
              referrerPolicy="no-referrer"
            />
          </picture>
        </div>
      );
    }
    return (
      <div
        style={{
          ...props.style,
          width: sizeStr,
          height: sizeStr,
          border: '1px solid #fff',
          color: '#fff',
          fontSize: Math.ceil(0.5 * size) + 'px',
          borderRadius: '50%',
          textAlign: 'center',
          lineHeight: size + 'px',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
        ref={ref}
      >
        {props.name ? (
          props.name.substring(0, 1)
        ) : (
          <AffineLogoSBlue2_1Icon fontSize={24} color={'#5438FF'} />
        )}
      </div>
    );
  }
);
export default UserAvatar;
