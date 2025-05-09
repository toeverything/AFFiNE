export const EXCLUDING_COPY_ACTIONS = [
  'brainstormMindmap',
  'expandMindmap',
  'makeItReal',
  'createSlides',
  'createImage',
  'findActions',
  'filterImage',
  'processImage',
];

export const EXCLUDING_REPLACE_ACTIONS = [
  'brainstormMindmap',
  'expandMindmap',
  'makeItReal',
  'createSlides',
  'createImage',
  'filterImage',
  'processImage',
];

export const EXCLUDING_INSERT_ACTIONS = ['generateCaption'];

export const IMAGE_ACTIONS = ['createImage', 'processImage', 'filterImage'];

const commonImageStages = ['Generating image', 'Rendering image'];

export const generatingStages: {
  [key in keyof Partial<BlockSuitePresets.AIActions>]: string[];
} = {
  makeItReal: ['Coding for you', 'Rendering the code'],
  brainstormMindmap: ['Thinking about this topic', 'Rendering mindmap'],
  createSlides: ['Thinking about this topic', 'Rendering slides'],
  createImage: commonImageStages,
  processImage: commonImageStages,
  filterImage: commonImageStages,
};

export const INSERT_ABOVE_ACTIONS = ['createHeadings'];
