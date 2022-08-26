import { RenderBlockChildren } from '@toeverything/components/editor-core';
import { ChildrenView, CreateView } from '@toeverything/framework/virgo';

export const GridItemRender = function (
    creator: (prop: ChildrenView) => JSX.Element
) {
    const GridItem = function (props: CreateView) {
        const { block } = props;
        const children = <RenderBlockChildren block={block} indent={false} />;
        return <>{creator({ ...props, children })}</>;
    };
    return GridItem;
};
