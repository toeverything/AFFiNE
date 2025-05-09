import { WithDisposable } from '@blocksuite/affine/global/lit';
import { GenerateDocUrlProvider } from '@blocksuite/affine/shared/services';
import { createDefaultDoc } from '@blocksuite/affine/shared/utils';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { Doc, Workspace } from '@blocksuite/affine/store';
import { CloseIcon } from '@blocksuite/icons/lit';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { removeModeFromStorage } from '../mock-services.js';

@customElement('docs-panel')
export class DocsPanel extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    docs-panel {
      display: flex;
      flex-direction: column;
      width: 100%;
      background-color: var(--affine-background-secondary-color);
      font-family: var(--affine-font-family);
      height: 100%;
      padding: 12px;
      gap: 4px;
    }
    .doc-item:hover .delete-doc-icon {
      display: flex;
    }
    .doc-item {
      color: var(--affine-text-primary-color);
    }
    .delete-doc-icon {
      display: none;
      padding: 2px;
      border-radius: 4px;
    }
    .delete-doc-icon:hover {
      background-color: var(--affine-hover-color);
    }
    .delete-doc-icon svg {
      width: 14px;
      height: 14px;
      color: var(--affine-secondary-color);
      fill: var(--affine-secondary-color);
    }
    .new-doc-button {
      margin-bottom: 16px;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--affine-text-primary-color);
    }
    .new-doc-button:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  createDoc = () => {
    createDocBlock(this.editor.doc.workspace);
  };

  gotoDoc = (doc: Doc) => {
    const url = this.editor.std
      .getOptional(GenerateDocUrlProvider)
      ?.generateDocUrl(doc.id);
    if (url) history.pushState({}, '', url);

    this.editor.doc = doc.getStore();
    this.editor.doc.load();
    this.editor.doc.resetHistory();
    this.requestUpdate();
  };

  private get collection() {
    return this.editor.doc.workspace;
  }

  private get docs() {
    return [...this.collection.docs.values()];
  }

  override connectedCallback() {
    super.connectedCallback();

    requestAnimationFrame(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (!(event.target instanceof Node)) return;

        const toggleButton = document.querySelector(
          'sl-button[data-docs-panel-toggle]'
        );
        if (toggleButton?.contains(event.target as Node)) return;

        if (!this.contains(event.target)) {
          this.onClose?.();
        }
      };
      document.addEventListener('click', handleClickOutside);
      this.disposables.add(() => {
        document.removeEventListener('click', handleClickOutside);
      });
    });

    this.disposables.add(
      this.editor.doc.workspace.slots.docListUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  protected override render(): unknown {
    const { docs, collection } = this;
    return html`
      <div @click="${this.createDoc}" class="new-doc-button">New Doc</div>
      ${repeat(
        docs,
        v => v.id,
        doc => {
          const style = styleMap({
            backgroundColor:
              this.editor.doc.id === doc.id
                ? 'var(--affine-hover-color)'
                : undefined,
            padding: '4px 4px 4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
          });
          const click = () => {
            this.gotoDoc(doc);
          };
          const deleteDoc = (e: MouseEvent) => {
            e.stopPropagation();
            const isDeleteCurrent = doc.id === this.editor.doc.id;

            collection.removeDoc(doc.id);
            removeModeFromStorage(doc.id);
            // When delete the current doc, we need to set the editor doc to the first remaining doc
            if (isDeleteCurrent) {
              this.editor.doc = this.docs[0].getStore();
            }
          };
          return html`<div class="doc-item" @click="${click}" style="${style}">
            ${doc.meta?.title || 'Untitled'}
            ${docs.length > 1
              ? html`<div @click="${deleteDoc}" class="delete-doc-icon">
                  ${CloseIcon()}
                </div>`
              : nothing}
          </div>`;
        }
      )}
    `;
  }

  @property({ attribute: false })
  accessor editor!: TestAffineEditorContainer;

  @property({ attribute: false })
  accessor onClose!: () => void;
}

function createDocBlock(collection: Workspace) {
  const id = collection.idGenerator();
  createDefaultDoc(collection, { id });
}

declare global {
  interface HTMLElementTagNameMap {
    'docs-panel': DocsPanel;
  }
}
