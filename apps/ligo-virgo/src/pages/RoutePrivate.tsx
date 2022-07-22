import { Navigate, useLocation } from 'react-router-dom';

import { PageLoading, Error } from '@toeverything/components/account';
import { useUserAndSpaces } from '@toeverything/datasource/state';

export type RoutePrivateProps = {
    children: JSX.Element;
    unauthorizedRedirectTo?: string;
};

/**
 * A routing component that cannot be accessed without logging in, and can only be accessed after logging in.
 */
export function RoutePrivate({
    children,
    unauthorizedRedirectTo = '/login',
}: RoutePrivateProps) {
    const { pathname } = useLocation();

    const { user, loading } = useUserAndSpaces();

    if (user == null && loading) {
        return <PageLoading />;
    }

    if (!user) {
        return (
            <Navigate
                to={unauthorizedRedirectTo}
                state={{ from: pathname }}
                replace={true}
            />
        );
    }

    return children;
}
