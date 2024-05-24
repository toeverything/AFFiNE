import {
  createReactComponentFromLit,
  type ElementOrFactory,
  toast,
  type ToastOptions,
  type useConfirmModal,
} from '@affine/component';
import type { BlockSpec } from '@blocksuite/block-std';
import type {
  AffineReference,
  ParagraphBlockService,
  RootService,
} from '@blocksuite/blocks';
import { LitElement, type TemplateResult } from 'lit';
import React from 'react';

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
      // todo: remove these type assertions
      spec.service = class extends (
        (spec.service as typeof ParagraphBlockService)
      ) {
        override mounted() {
          super.mounted();
          this.referenceNodeConfig.setCustomContent(litRenderer);
        }
      };
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
  );

  if (!rootSpec) {
    return specs;
  }

  rootSpec.service = class extends (rootSpec.service as typeof RootService) {
    override notificationService = {
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
            description:
              typeof message === 'string' ? (
                message
              ) : (
                <TemplateWrapper template={message} />
              ),
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
      notify: async () => {},
    };
  };
  return specs;
}
