import { FC } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import { BlockContainer } from '../../components/BlockContainer';

export function GridRender(creator: FC<CreateView>) {
    return function GridWithItem(props: CreateView) {
        const { editor, block } = props;
        return (
            <BlockContainer editor={editor} block={block} selected={false}>
                {creator({ ...props })}
            </BlockContainer>
        );
    };
}
