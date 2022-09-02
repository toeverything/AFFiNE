import { RenderBlockChildren } from '@toeverything/components/editor-core';
import type { CreateView } from '@toeverything/framework/virgo';

export const ScenePage = ({ block }: CreateView) => {
    return <RenderBlockChildren block={block} indent={false} />;
};
