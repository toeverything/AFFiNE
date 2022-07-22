import { useMemo } from 'react';
import { getAuth, signOut } from 'firebase/auth';

import { LOGOUT_COOKIES, LOGOUT_LOCAL_STORAGE } from '@toeverything/utils';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import {
    MuiDivider as Divider,
    MuiList as List,
    MuiListItem as ListItem,
    MuiListItemText as ListItemText,
} from '@toeverything/components/ui';

export const UserMenuList = () => {
    const { user } = useUserAndSpaces();

    const user_menu_data = useMemo(() => {
        return [
            // {
            // text: 'Settings',
            // onClick: () => {
            // console.log('Open the settings panel');
            // },
            // },
            {
                text: user?.email || 'Unknown User',
                showDivider: true,
            },
            {
                text: 'Logout',
                onClick: async () => {
                    LOGOUT_LOCAL_STORAGE.forEach(name =>
                        localStorage.removeItem(name)
                    );
                    // localStorage.clear();
                    document.cookie = LOGOUT_COOKIES.map(
                        name =>
                            name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
                    ).join(' ');

                    signOut(getAuth());

                    window.location.href = '/';
                },
            },
        ];
    }, [user?.email]);

    return (
        <List component="nav" aria-label="user settings">
            {user_menu_data.map(menu => {
                const { text, onClick, showDivider } = menu;

                return (
                    <>
                        <ListItem button onClick={onClick} key={text}>
                            <ListItemText primary={text} />
                        </ListItem>
                        {showDivider && <Divider />}
                    </>
                );
            })}
        </List>
    );
};

export default UserMenuList;
