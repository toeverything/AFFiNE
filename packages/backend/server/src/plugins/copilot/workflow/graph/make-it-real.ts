import { NodeExecutorType } from '../executor';
import { type WorkflowGraph, WorkflowNodeType } from '../types';

export const makeItReal: WorkflowGraph = {
  name: 'make-it-real',
  graph: [
    {
      id: 'start',
      name: 'Layout Enhancer',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:layout-enhancer',
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Doc Composer',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:doc-composer',
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'More HTML',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:more-html',
      edges: [],
    },
  ],
};
