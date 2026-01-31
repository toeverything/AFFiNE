import {
  ImageIcon,
  LanguageIcon,
  MindmapIcon,
  PenIcon,
  SendIcon,
} from '@blocksuite/icons/lit';

import { AIProvider } from '../../provider/ai-provider.js';
import completeWritingWithAI from './templates/completeWritingWithAI.zip';
import freelyCommunicateWithAI from './templates/freelyCommunicateWithAI.zip';
import readAforeign from './templates/readAforeign.zip';
import redHat from './templates/redHat.zip';
import TidyMindMapV3 from './templates/TidyMindMapV3.zip';

export const AIPreloadConfig = [
  {
    icon: LanguageIcon(),
    text: 'Read a foreign language article with AI',
    testId: 'read-foreign-language-article-with-ai',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.next({
        template: readAforeign,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: MindmapIcon(),
    text: 'Tidy an article with AI MindMap Action',
    testId: 'tidy-an-article-with-ai-mindmap-action',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.next({
        template: TidyMindMapV3,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: ImageIcon(),
    text: 'Add illustrations to the article',
    testId: 'add-illustrations-to-the-article',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.next({
        template: redHat,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: PenIcon(),
    text: 'Complete writing with AI',
    testId: 'complete-writing-with-ai',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.next({
        template: completeWritingWithAI,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: SendIcon(),
    text: 'Freely communicate with AI',
    testId: 'freely-communicate-with-ai',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.next({
        template: freelyCommunicateWithAI,
        mode: 'edgeless',
      });
    },
  },
];
