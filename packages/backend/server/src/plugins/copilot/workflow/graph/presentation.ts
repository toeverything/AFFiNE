import { NodeExecutorType } from '../executor';
import type { WorkflowGraph, WorkflowNodeState } from '../types';
import { WorkflowNodeType } from '../types';

export const presentation: WorkflowGraph = {
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
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'Step 3: format presentation if needed',
      nodeType: WorkflowNodeType.Decision,
      condition: (nodeIds: string[], params: WorkflowNodeState) => {
        const lines = params.content?.split('\n') || [];
        return nodeIds[
          Number(
            !lines.some(line => {
              try {
                if (line.trim()) {
                  JSON.parse(line);
                }
                return false;
              } catch {
                return true;
              }
            })
          )
        ];
      },
      edges: ['step4', 'step5'],
    },
    {
      id: 'step4',
      name: 'Step 4: format presentation',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:presentation:step4',
      edges: ['step5'],
    },
    {
      id: 'step5',
      name: 'Step 5: finish',
      nodeType: WorkflowNodeType.Nope,
      edges: [],
    },
  ],
};
