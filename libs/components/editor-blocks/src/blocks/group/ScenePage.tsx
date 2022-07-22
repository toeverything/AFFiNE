import { RenderBlockChildren } from '@toeverything/components/editor-core';
import type { CreateView } from '@toeverything/framework/virgo';
import { FC } from 'react';

export const ScenePage: FC<CreateView> = ({ block }) => {
    return <RenderBlockChildren block={block} />;
};
