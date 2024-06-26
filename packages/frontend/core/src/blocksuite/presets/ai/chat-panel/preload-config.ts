import {
  ArticleIcon,
  CommunicateIcon,
  MindmapIcon,
  PreloadImageIcon,
  PreloadPenIcon,
} from '../_common/icons.js';
import { AIProvider } from '../provider.js';
import completeWritingWithAI from './templates/completeWritingWithAI.zip';
import freelyCommunicateWithAI from './templates/freelyCommunicateWithAI.zip';
import readAforeign from './templates/readAforeign.zip';
import redHat from './templates/redHat.zip';
import TidyMindMapV3 from './templates/TidyMindMapV3.zip';

export const AIPreloadConfig = [
  {
    icon: ArticleIcon,
    text: 'Read a foreign language article with AI',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.emit({
        template: readAforeign,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: MindmapIcon,
    text: 'Tidy a article with AI MindMap Action',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.emit({
        template: TidyMindMapV3,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: PreloadImageIcon,
    text: 'Add illustrations to the article',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.emit({
        template: redHat,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: PreloadPenIcon,
    text: 'Complete writing with AI',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.emit({
        template: completeWritingWithAI,
        mode: 'edgeless',
      });
    },
  },
  {
    icon: CommunicateIcon,
    text: 'Freely communicate with AI',
    handler: () => {
      AIProvider.slots.requestInsertTemplate.emit({
        template: freelyCommunicateWithAI,
        mode: 'edgeless',
      });
    },
  },
];
