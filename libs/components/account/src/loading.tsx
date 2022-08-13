import { MuiCircularProgress as CircularProgress } from '@toeverything/components/ui';

/**
 * Loading components occupy the entire page
 */
export function PageLoading() {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: 'calc( 100vh - 64px )',
            }}
        >
            <CircularProgress />
        </div>
    );
}
