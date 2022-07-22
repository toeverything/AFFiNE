import style9 from 'style9';

import { DndTree } from './DndTree';
import { useDndTreeAutoUpdate } from './use-page-tree';

const styles = style9.create({
    root: {
        minWidth: 160,
        maxWidth: 260,
        marginLeft: 18,
        marginRight: 6,
    },
});

export const PageTree = () => {
    useDndTreeAutoUpdate();
    return (
        <div className={styles('root')}>
            <DndTree collapsible removable />
        </div>
    );
};
