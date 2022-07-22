import style9 from 'style9';
import { MuiCircularProgress as CircularProgress } from '@toeverything/components/ui';

const styles = style9.create({
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: 'calc( 100vh - 64px )',
    },
});

/**
 * Loading components occupy the entire page
 */
export function PageLoading() {
    return (
        <div className={styles('container')}>
            <CircularProgress />
        </div>
    );
}
