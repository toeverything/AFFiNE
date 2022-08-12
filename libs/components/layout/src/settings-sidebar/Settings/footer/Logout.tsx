import type { FC } from 'react';
import { MoveToIcon } from '@toeverything/components/icons';
import {
    ListItem,
    ListIcon,
    styled,
    Typography,
} from '@toeverything/components/ui';
import { LOGOUT_COOKIES, LOGOUT_LOCAL_STORAGE } from '@toeverything/utils';
import { getAuth, signOut } from 'firebase/auth';

const logout = () => {
    LOGOUT_LOCAL_STORAGE.forEach(name => localStorage.removeItem(name));
    // localStorage.clear();
    document.cookie = LOGOUT_COOKIES.map(
        name => name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    ).join(' ');

    signOut(getAuth());

    window.location.href = '/';
};

export const Logout = () => {
    return (
        <ListItem onClick={logout}>
            <StyledIcon />
            <ContentText type="base">Logout</ContentText>
        </ListItem>
    );
};

const StyledIcon = styled(MoveToIcon)(({ theme }) => {
    return {
        color: theme.affine.palette.icons,
    };
});

const ContentText = styled(Typography)(({ theme }) => ({
    marginLeft: '12px',
    color: theme.affine.palette.menu,
    fontWeight: 300,
}));
