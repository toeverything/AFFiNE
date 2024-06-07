import { type WorkflowGraphList, WorkflowNodeType } from './types';

export const WorkflowGraphs: WorkflowGraphList = [
  {
    name: 'presentation',
    graph: [
      {
        id: 'start',
        name: 'Start: check language',
        nodeType: WorkflowNodeType.Basic,
        type: 'text',
        promptName: 'workflow:presentation:step1',
        paramKey: 'language',
        edges: ['step2'],
      },
      {
        id: 'step2',
        name: 'Step 2: generate presentation',
        nodeType: WorkflowNodeType.Basic,
        type: 'text',
        promptName: 'workflow:presentation:step2',
        edges: [],
        // edges: ['step3'],
      },
      //   {
      //     id: 'step3',
      //     name: 'Step 3: check format',
      //     nodeType: WorkflowNodeType.Basic,
      //     type: 'text',
      //     promptName: 'workflow:presentation:step3',
      //     paramKey: 'needFormat',
      //     edges: ['step4'],
      //   },
      // {
      //   id: 'step4',
      //   name: 'Step 4: format presentation if needed',
      //   nodeType: WorkflowNodeType.Decision,
      //   condition: ((
      //     nodeIds: string[],
      //     params: WorkflowNodeState
      //   ) =>
      //     nodeIds[
      //       Number(String(params.needFormat).toLowerCase() === 'true')
      //     ]).toString(),
      //   edges: ['step5', 'step6'],
      // },
      // {
      //   id: 'step5',
      //   name: 'Step 5: format presentation',
      //   nodeType: WorkflowNodeType.Basic,
      //   type: 'text',
      //   promptName: 'workflow:presentation:step5',
      //   edges: ['step6'],
      // },
      // {
      //   id: 'step6',
      //   name: 'Step 6: finish',
      //   nodeType: WorkflowNodeType.Basic,
      //   type: 'text',
      //   promptName: 'workflow:presentation:step6',
      //   edges: [],
      // },
    ],
  },
];
