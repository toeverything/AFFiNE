import type { PeekViewService } from '@affine/core/modules/peek-view';
import { DebugLogger } from '@affine/debug';
import type {
  PeekOptions,
  PeekViewService as BSPeekViewService,
} from '@blocksuite/affine/components/peek';
import { PeekViewExtension } from '@blocksuite/affine/components/peek';
import type { TemplateResult } from 'lit';

const logger = new DebugLogger('affine::patch-peek-view-service');

export function patchPeekViewService(service: PeekViewService) {
  return PeekViewExtension({
    peek: (
      element: {
        target: HTMLElement;
        docId: string;
        blockIds?: string[];
        template?: TemplateResult;
      },
      options?: PeekOptions
    ) => {
      logger.debug('center peek', element);
      const { template, target, ...props } = element;

      return service.peekView.open(
        {
          element: target,
          docRef: props,
        },
        template,
        options?.abortSignal
      );
    },
  } satisfies BSPeekViewService);
}
