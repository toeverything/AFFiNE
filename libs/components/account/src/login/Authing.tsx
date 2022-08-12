import { Guard as AuthingGuard } from '@authing/react-ui-components';
import { MuiBox as Box } from '@toeverything/components/ui';
import type { User as AuthingUser } from 'authing-js-sdk';
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import style9 from 'style9';

import { useUserAndSpaces } from '@toeverything/datasource/state';
import { AUTHING_APP_HOST_US, AUTHING_APP_ID_US } from '@toeverything/utils';

import '@authing/react-ui-components/lib/index.min.css';

export function Authing() {
    const navigate = useNavigate();
    const { handleUserLoginSuccess, currentSpaceId } = useUserAndSpaces();

    /**
     * Refer to Authing documentation https://docs.authing.cn/v2/reference/guard/react.html
     */
    const handle_login_success = useCallback(
        async (authingUser: AuthingUser) => {
            handleUserLoginSuccess(authingUser);
        },
        [handleUserLoginSuccess]
    );

    const authing_config = useMemo(() => {
        return {
            host: AUTHING_APP_HOST_US,
        };
    }, []);

    useEffect(() => {
        if (currentSpaceId) {
            const targetRoute = `/${currentSpaceId}`;
            navigate(targetRoute);
        }
    }, [currentSpaceId, navigate]);

    return (
        <div className={styles('loginContainer')}>
            <Box
                sx={{
                    '.g2-view-header': {
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                    },
                    '.authing-g2-render-module': {
                        boxShadow: '0 2px 10px 0 rgb(57 106 255 / 20%)',
                    },
                }}
            >
                <AuthingGuard
                    onLogin={handle_login_success}
                    appId={AUTHING_APP_ID_US}
                    config={authing_config}
                />
                <Box sx={{ height: '56px' }} />
            </Box>
        </div>
    );
}

const styles = style9.create({
    loginContainer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: 'calc( 100vh - 64px )',
    },
});
