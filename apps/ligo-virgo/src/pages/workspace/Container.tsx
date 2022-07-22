import { Outlet } from 'react-router-dom';
import style9 from 'style9';

import { MuiBox as Box } from '@toeverything/components/ui';

const styles = style9.create({
    container: {
        display: 'flex',
        overflow: 'hidden',
    },
});

export function WorkspaceRootContainer() {
    return (
        <Box className={styles('container')}>
            <Outlet />
        </Box>
    );
}
