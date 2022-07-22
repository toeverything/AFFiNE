import { MuiAvatar as Avatar, Popover } from '@toeverything/components/ui';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { getUserDisplayName } from '@toeverything/utils';
import { UserMenuList } from './UserMenuList';

/**
 * An icon is displayed by default, click the icon to display the popover, and the content of the popover is children.
 */
export const UserMenuIcon = () => {
    const { user } = useUserAndSpaces();

    return (
        <Popover
            content={<UserMenuList />}
            placement="bottom-end"
            trigger="click"
        >
            <Avatar
                // onClick={handleClick}
                sx={{
                    width: 26,
                    height: 26,
                    mr: 4,
                    cursor: 'pointer',
                    fontSize: '1rem',
                }}
                alt={getUserDisplayName(user)}
                src={user?.photo || ''}
            />
        </Popover>
    );
};

export default UserMenuIcon;
