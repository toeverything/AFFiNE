import { RenderBlock } from '@toeverything/components/editor-core';
import { ChildrenView, CreateView } from '@toeverything/framework/virgo';

export const GridItemRender = function (
    creator: (prop: ChildrenView) => JSX.Element
) {
    const GridItem = function (props: CreateView) {
        const { block } = props;
        const children = (
            <>
                {block.childrenIds.map(id => {
                    return <RenderBlock key={id} blockId={id} />;
                })}
            </>
        );
        return <>{creator({ ...props, children })}</>;
    };
    return GridItem;
};
