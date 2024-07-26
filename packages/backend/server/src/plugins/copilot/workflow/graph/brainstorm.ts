import { NodeExecutorType } from '../executor';
import { type WorkflowGraph, WorkflowNodeType } from '../types';

export const brainstorm: WorkflowGraph = {
  name: 'brainstorm',
  graph: [
    {
      id: 'start',
      name: 'Start: check language',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:brainstorm:step1',
      paramKey: 'language',
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Step 2: generate brainstorm mind map',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:brainstorm:step2',
      edges: [],
    },
  ],
};
