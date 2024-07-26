import { NodeExecutorType } from '../executor';
import type { WorkflowGraph, WorkflowParams } from '../types';
import { WorkflowNodeType } from '../types';

export const sketch: WorkflowGraph = {
  name: 'image-sketch',
  graph: [
    {
      id: 'start',
      name: 'Start: extract edge',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'debug:action:fal-teed',
      paramKey: 'controlnets',
      paramToucher: params => {
        if (Array.isArray(params.controlnets)) {
          const controlnets = params.controlnets.map(image_url => ({
            path: 'diffusers/controlnet-canny-sdxl-1.0',
            image_url,
            start_percentage: 0.1,
            end_percentage: 0.6,
          }));
          return { controlnets } as WorkflowParams;
        } else {
          return {};
        }
      },
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Step 2: generate tags',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:image-sketch:step2',
      paramKey: 'tags',
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'Step3: generate image',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'workflow:image-sketch:step3',
      edges: [],
    },
  ],
};

export const clay: WorkflowGraph = {
  name: 'image-clay',
  graph: [
    {
      id: 'start',
      name: 'Start: extract edge',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'debug:action:fal-teed',
      paramKey: 'controlnets',
      paramToucher: params => {
        if (Array.isArray(params.controlnets)) {
          const controlnets = params.controlnets.map(image_url => ({
            path: 'diffusers/controlnet-canny-sdxl-1.0',
            image_url,
            start_percentage: 0.1,
            end_percentage: 0.6,
          }));
          return { controlnets } as WorkflowParams;
        } else {
          return {};
        }
      },
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Step 2: generate tags',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:image-clay:step2',
      paramKey: 'tags',
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'Step3: generate image',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'workflow:image-clay:step3',
      edges: [],
    },
  ],
};

export const anime: WorkflowGraph = {
  name: 'image-anime',
  graph: [
    {
      id: 'start',
      name: 'Start: extract edge',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'debug:action:fal-teed',
      paramKey: 'controlnets',
      paramToucher: params => {
        if (Array.isArray(params.controlnets)) {
          const controlnets = params.controlnets.map(image_url => ({
            path: 'diffusers/controlnet-canny-sdxl-1.0',
            image_url,
            start_percentage: 0.1,
            end_percentage: 0.6,
          }));
          return { controlnets } as WorkflowParams;
        } else {
          return {};
        }
      },
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Step 2: generate tags',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:image-anime:step2',
      paramKey: 'tags',
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'Step3: generate image',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'workflow:image-anime:step3',
      edges: [],
    },
  ],
};

export const pixel: WorkflowGraph = {
  name: 'image-pixel',
  graph: [
    {
      id: 'start',
      name: 'Start: extract edge',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'debug:action:fal-teed',
      paramKey: 'controlnets',
      paramToucher: params => {
        if (Array.isArray(params.controlnets)) {
          const controlnets = params.controlnets.map(image_url => ({
            path: 'diffusers/controlnet-canny-sdxl-1.0',
            image_url,
            start_percentage: 0.1,
            end_percentage: 0.6,
          }));
          return { controlnets } as WorkflowParams;
        } else {
          return {};
        }
      },
      edges: ['step2'],
    },
    {
      id: 'step2',
      name: 'Step 2: generate tags',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatText,
      promptName: 'workflow:image-pixel:step2',
      paramKey: 'tags',
      edges: ['step3'],
    },
    {
      id: 'step3',
      name: 'Step3: generate image',
      nodeType: WorkflowNodeType.Basic,
      type: NodeExecutorType.ChatImage,
      promptName: 'workflow:image-pixel:step3',
      edges: [],
    },
  ],
};
