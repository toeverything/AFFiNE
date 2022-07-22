import { AsyncBlock, CreateView } from '@toeverything/framework/virgo';
import { createContext } from 'react';

const SceneKanbanContext = createContext<{
    editor: CreateView['editor'];
    block: AsyncBlock;
}>({} as any);

export { SceneKanbanContext };
