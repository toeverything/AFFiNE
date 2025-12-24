// manually synced with packages/backend/server/src/data/migrations/utils/prompts.ts
// TODO(@Peng): automate this
export const promptKeys = [
  // text actions
  'Chat With AFFiNE AI',
  'Summary',
  'Summary as title',
  'Generate a caption',
  'Summary the webpage',
  'Explain this',
  'Explain this image',
  'Explain this code',
  'Translate to',
  'Write an article about this',
  'Write a twitter about this',
  'Write a poem about this',
  'Write a blog post about this',
  'Write outline',
  'Change tone to',
  'Brainstorm ideas about this',
  'Expand mind map',
  'Improve writing for it',
  'Improve grammar for it',
  'Fix spelling for it',
  'Find action items from it',
  'Check code error',
  'Create headings',
  'Make it real',
  'Make it real with text',
  'Make it longer',
  'Make it shorter',
  'Continue writing',
  // image actions
  'Generate image',
  'Convert to Anime style',
  'Convert to Clay style',
  'Convert to Pixel style',
  'Convert to Sketch style',
  'Convert to sticker',
  'Upscale image',
  'Remove background',
  // workflows
  'workflow:presentation',
  'workflow:brainstorm',
] as const;

export type PromptKey = (typeof promptKeys)[number];
