import { Outlet } from 'react-router-dom';

import { MuiBox as Box } from '@toeverything/components/ui';

export function WorkspaceRootContainer() {
    return (
        <Box
            style={{
                display: 'flex',
                overflow: 'hidden',
            }}
        >
            <Outlet />
        </Box>
    );
}
