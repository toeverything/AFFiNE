import { Outlet } from 'react-router-dom';

import { MuiBox as Box } from '@toeverything/components/ui';

export default function AgendaRootContainer() {
    return (
        <Box style={{ display: 'flex' }}>
            <Outlet />
        </Box>
    );
}
