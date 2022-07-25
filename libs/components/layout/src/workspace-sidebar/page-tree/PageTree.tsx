import { styled } from '@toeverything/components/ui';
import { DndTree } from './DndTree';
import { useDndTreeAutoUpdate } from './use-page-tree';

const Root = styled('div')({
    minWidth: 160,
    maxWidth: 260,
    marginLeft: 18,
    marginRight: 6,
});

export const PageTree = () => {
    useDndTreeAutoUpdate();
    return (
        <Root>
            <DndTree collapsible removable />
        </Root>
    );
};
