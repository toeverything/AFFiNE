import { Menu, MenuItem } from '@affine/component';
import { Logo1Icon, SignOutIcon } from '@blocksuite/icons';
import type { CSSProperties } from 'react';
import { forwardRef } from 'react';

const EditMenu = (
  <MenuItem data-testid="editor-option-menu-favorite" icon={<SignOutIcon />}>
    Sign Out
  </MenuItem>
);

export const UserAvatar = () => {
  // fixme: cloud regression
  const user: any = null;
  return (
    <Menu
      width={276}
      content={EditMenu}
      placement="bottom"
      disablePortal={true}
      trigger="click"
    >
      {user ? (
        <WorkspaceAvatar
          size={24}
          name={user.name}
          avatar={user.avatar_url}
        ></WorkspaceAvatar>
      ) : (
        <WorkspaceAvatar size={24}></WorkspaceAvatar>
      )}
    </Menu>
  );
};

interface WorkspaceAvatarProps {
  size: number;
  name?: string;
  avatar?: string;
  style?: CSSProperties;
}

export const WorkspaceAvatar = forwardRef<HTMLDivElement, WorkspaceAvatarProps>(
  function WorkspaceAvatar(props, ref) {
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
        ) : (
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
              <Logo1Icon fontSize={24} color={'#5438FF'} />
            )}
          </div>
        )}
      </>
    );
  }
);
export default UserAvatar;
