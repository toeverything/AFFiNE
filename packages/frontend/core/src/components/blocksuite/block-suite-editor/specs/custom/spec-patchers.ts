import {
  createReactComponentFromLit,
  type ElementOrFactory,
  notify,
  toast,
  type ToastOptions,
  type useConfirmModal,
} from '@affine/component';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { ActivePeekView } from '@affine/core/modules/peek-view/entities/peek-view';
import { DebugLogger } from '@affine/debug';
import type { BlockSpec } from '@blocksuite/block-std';
import type {
  AffineReference,
  ParagraphBlockService,
  RootService,
} from '@blocksuite/blocks';
import { LitElement, type TemplateResult } from 'lit';
import React, { createElement, type ReactNode } from 'react';

const logger = new DebugLogger('affine::spec-patchers');

export type ReferenceReactRenderer = (
  reference: AffineReference
) => React.ReactElement;

export class LitTemplateWrapper extends LitElement {
  static override get properties() {
    return {
      template: { type: Object },
    };
  }
  template: TemplateResult | null = null;
  // do not enable shadow root
  override createRenderRoot() {
    return this;
  }

  override render() {
    return this.template;
  }
}

window.customElements.define('affine-lit-template-wrapper', LitTemplateWrapper);

const TemplateWrapper = createReactComponentFromLit({
  elementClass: LitTemplateWrapper,
  react: React,
});

const toReactNode = (template?: TemplateResult | string): ReactNode => {
  if (!template) return null;
  return typeof template === 'string'
    ? template
    : createElement(TemplateWrapper, { template });
};

function patchSpecService<Spec extends BlockSpec>(
  spec: Spec,
  onMounted: (
    service: Spec extends BlockSpec<any, infer BlockService>
      ? BlockService
      : never
  ) => (() => void) | void
) {
  const oldSetup = spec.setup;
  spec.setup = (slots, disposableGroup) => {
    oldSetup?.(slots, disposableGroup);
    disposableGroup.add(
      slots.mounted.on(({ service }) => {
        const disposable = onMounted(service as any);
        if (disposable) {
          disposableGroup.add(disposable);
        }
      })
    );
  };
  return spec;
}

/**
 * Patch the block specs with custom renderers.
 */
export function patchReferenceRenderer(
  specs: BlockSpec[],
  reactToLit: (element: ElementOrFactory) => TemplateResult,
  reactRenderer: ReferenceReactRenderer
) {
  const litRenderer = (reference: AffineReference) => {
    const node = reactRenderer(reference);
    return reactToLit(node);
  };

  return specs.map(spec => {
    if (
      ['affine:paragraph', 'affine:list', 'affine:database'].includes(
        spec.schema.model.flavour
      )
    ) {
      spec = patchSpecService(
        spec as BlockSpec<string, ParagraphBlockService>,
        service => {
          service.referenceNodeConfig.setCustomContent(litRenderer);
          return () => {
            service.referenceNodeConfig.setCustomContent(null);
          };
        }
      );
    }

    return spec;
  });
}

export function patchNotificationService(
  specs: BlockSpec[],
  { closeConfirmModal, openConfirmModal }: ReturnType<typeof useConfirmModal>
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(rootSpec, service => {
    service.notificationService = {
      confirm: async ({
        title,
        message,
        confirmText,
        cancelText,
        abort,
      }: {
        title: string;
        message: string | TemplateResult;
        confirmText: string;
        cancelText: string;
        abort?: AbortSignal;
      }) => {
        return new Promise<boolean>(resolve => {
          openConfirmModal({
            title,
            description: toReactNode(message),
            confirmButtonOptions: {
              children: confirmText,
              type: 'primary',
            },
            cancelText,
            onConfirm: () => {
              resolve(true);
            },
            onCancel: () => {
              resolve(false);
            },
          });
          abort?.addEventListener('abort', () => {
            resolve(false);
            closeConfirmModal();
          });
        });
      },
      toast: (message: string, options: ToastOptions) => {
        return toast(message, options);
      },
      notify: notification => {
        const accentToNotify = {
          error: notify.error,
          success: notify.success,
          warning: notify.warning,
          info: notify,
        };

        const fn = accentToNotify[notification.accent || 'info'];
        if (!fn) {
          throw new Error('Invalid notification accent');
        }

        const toastId = fn(
          {
            title: toReactNode(notification.title),
            message: toReactNode(notification.message),
          },
          {
            duration: notification.duration || 0,
          }
        );

        notification.abort?.addEventListener('abort', () => {
          notify.dismiss(toastId);
        });
      },
    };
  });
  return specs;
}

export function patchPeekViewService(
  specs: BlockSpec[],
  service: PeekViewService
) {
  const rootSpec = specs.find(
    spec => spec.schema.model.flavour === 'affine:page'
  ) as BlockSpec<string, RootService>;

  if (!rootSpec) {
    return specs;
  }

  patchSpecService(rootSpec, pageService => {
    pageService.peekViewService = {
      peek: (target: ActivePeekView['target']) => {
        logger.debug('center peek', target);
        service.peekView.open(target);
      },
    };
  });

  return specs;
}
