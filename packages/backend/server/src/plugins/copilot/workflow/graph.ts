import { NodeExecutorType } from './executor';
import type { WorkflowGraphs } from './types';
import { WorkflowNodeType } from './types';

export const WorkflowGraphList: WorkflowGraphs = [
  {
    name: 'presentation',
    graph: [
      {
        id: 'start',
        name: 'Start: check language',
        nodeType: WorkflowNodeType.Basic,
        type: NodeExecutorType.ChatText,
        promptName: 'workflow:presentation:step1',
        paramKey: 'language',
        edges: ['step2'],
      },
      {
        id: 'step2',
        name: 'Step 2: generate presentation',
        nodeType: WorkflowNodeType.Basic,
        type: NodeExecutorType.ChatText,
        promptName: 'workflow:presentation:step2',
        edges: [],
      },
    ],
  },
];
