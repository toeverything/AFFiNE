import { Menu, MenuItem } from '@affine/component';
import { SignOutIcon } from '@blocksuite/icons';
import type { CSSProperties } from 'react';
import { useState } from 'react';

const EditMenu = (
  <MenuItem data-testid="editor-option-menu-favorite" icon={<SignOutIcon />}>
    Sign Out
  </MenuItem>
);

export const UserAvatar = () => {
  const [user] = useState(true);
  return (
    <Menu
      width={276}
      content={EditMenu}
      placement="bottom-end"
      disablePortal={true}
      trigger="click"
    >
      {user ? (
        <WorkspaceAvatar
          size={20}
          name={'user.name'}
          avatar={'user.avatar_url'}
        ></WorkspaceAvatar>
      ) : (
        <WorkspaceAvatar
          size={20}
          name={'A'}
          avatar={'user.avatar_url'}
        ></WorkspaceAvatar>
      )}
    </Menu>
  );
};

interface WorkspaceAvatarProps {
  size: number;
  name: string | undefined;
  avatar: string | undefined;
  style?: CSSProperties;
}

export const WorkspaceAvatar: React.FC<WorkspaceAvatarProps> = props => {
  const size = props.size || 20;
  const sizeStr = size + 'px';

  return (
    <>
      {props.avatar ? (
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
      ) : (
        <div
          style={{
            ...props.style,
            width: sizeStr,
            height: sizeStr,
            border: '1px solid #fff',
            color: '#fff',
            fontSize: Math.ceil(0.5 * size) + 'px',
            background: '#66ccff',
            borderRadius: '50%',
            textAlign: 'center',
            lineHeight: size + 'px',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        >
          {(props.name || 'AFFiNE').substring(0, 1)}
        </div>
      )}
    </>
  );
};
export default UserAvatar;
