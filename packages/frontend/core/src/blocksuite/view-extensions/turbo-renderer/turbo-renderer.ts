import { getWorkerUrl } from '@affine/env/worker';
import { CodeLayoutHandlerExtension } from '@blocksuite/affine/blocks/code';
import { ImageLayoutHandlerExtension } from '@blocksuite/affine/blocks/image';
import { ListLayoutHandlerExtension } from '@blocksuite/affine/blocks/list';
import { NoteLayoutHandlerExtension } from '@blocksuite/affine/blocks/note';
import { ParagraphLayoutHandlerExtension } from '@blocksuite/affine/blocks/paragraph';
import {
  TurboRendererConfigFactory,
  ViewportTurboRendererExtension,
} from '@blocksuite/affine/gfx/turbo-renderer';

function createPainterWorker() {
  const worker = new Worker(getWorkerUrl('turbo-painter'));
  return worker;
}

export const turboRendererExtension = [
  ParagraphLayoutHandlerExtension,
  ListLayoutHandlerExtension,
  NoteLayoutHandlerExtension,
  CodeLayoutHandlerExtension,
  ImageLayoutHandlerExtension,
  TurboRendererConfigFactory({
    options: {
      zoomThreshold: 1,
      debounceTime: 1000,
    },
    painterWorkerEntry: createPainterWorker,
  }),
  ViewportTurboRendererExtension,
];
