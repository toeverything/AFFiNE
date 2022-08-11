import { styled } from '@toeverything/components/ui';
import { DndTree } from './DndTree';
import { useDndTreeAutoUpdate } from './use-page-tree';

const Root = styled('div')({
    minWidth: '160px',
    maxWidth: '276px',
});

export const PageTree = () => {
    useDndTreeAutoUpdate();
    return (
        <Root>
            <DndTree collapsible removable />
        </Root>
    );
};
