import { ConfirmIcon } from '@blocksuite/affine-components/icons';
import { toast } from '@blocksuite/affine-components/toast';
import type { AttachmentBlockModel } from '@blocksuite/affine-model';
import { CitationProvider } from '@blocksuite/affine-shared/services';
import type { EditorHost } from '@blocksuite/std';
import { html } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { renameStyles } from './styles';

export const RenameModal = ({
  editorHost,
  model,
  abortController,
}: {
  editorHost: EditorHost;
  model: AttachmentBlockModel;
  abortController: AbortController;
}) => {
  const inputRef = createRef<HTMLInputElement>();
  // Fix auto focus
  setTimeout(() => inputRef.value?.focus());
  const originalName = model.props.name;
  const nameWithoutExtension = originalName.slice(
    0,
    originalName.lastIndexOf('.')
  );
  const originalExtension = originalName.slice(originalName.lastIndexOf('.'));
  const includeExtension =
    originalExtension.includes('.') &&
    originalExtension.length <= 7 &&
    // including the dot
    originalName.length > originalExtension.length;

  let fileName = includeExtension ? nameWithoutExtension : originalName;
  const extension = includeExtension ? originalExtension : '';
  const citationService = editorHost.std.get(CitationProvider);

  const abort = () => abortController.abort();
  const onConfirm = () => {
    const newFileName = fileName + extension;
    if (!newFileName) {
      toast(editorHost, 'File name cannot be empty');
      return;
    }
    model.store.updateBlock(model, {
      name: newFileName,
    });
    if (citationService.isCitationModel(model)) {
      citationService.trackEvent('Edit');
    }
    abort();
  };
  const onInput = (e: InputEvent) => {
    fileName = (e.target as HTMLInputElement).value;
  };
  const onKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === 'Escape' && !e.isComposing) {
      abort();
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      onConfirm();
      return;
    }
  };

  return html`
    <style>
      ${renameStyles}
    </style>
    <div class="affine-attachment-rename-overlay-mask" @click="${abort}"></div>
    <div class="affine-attachment-rename-container">
      <div class="affine-attachment-rename-input-wrapper">
        <input
          ${ref(inputRef)}
          type="text"
          .value=${fileName}
          @input=${onInput}
          @keydown=${onKeydown}
        />
        <span class="affine-attachment-rename-extension">${extension}</span>
      </div>
      <editor-icon-button
        class="affine-confirm-button"
        .iconSize=${'24px'}
        @click=${onConfirm}
      >
        ${ConfirmIcon}
      </editor-icon-button>
    </div>
  `;
};
