import { Navigate, useLocation } from 'react-router-dom';

import { PageLoading } from '@toeverything/components/account';
import { useUserAndSpaces } from '@toeverything/datasource/state';

export type RouteUnauthorizedOnlyProps = {
    children: JSX.Element;
};

/**
 * Routing components that are accessible without logging in and inaccessible after logging in will automatically jump to the specified route authorizedRedirectTo
 */
export function RoutePublicAutoLogin({ children }: RouteUnauthorizedOnlyProps) {
    const { pathname } = useLocation();

    const { user, loading, currentSpaceId } = useUserAndSpaces();

    if (user == null && loading) {
        return <PageLoading />;
    }

    if (currentSpaceId) {
        return (
            <Navigate
                to={`/${currentSpaceId}`}
                state={{ from: pathname }}
                replace={true}
            />
        );
    }

    return children;
}
