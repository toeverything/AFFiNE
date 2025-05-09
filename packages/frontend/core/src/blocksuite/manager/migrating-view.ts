import { createDatabaseOptionsConfig } from '@affine/core/blocksuite/extensions/editor-config/database';
import { createLinkedWidgetConfig } from '@affine/core/blocksuite/extensions/editor-config/linked';
import { AffineCommonViewExtension } from '@affine/core/blocksuite/manager/common-view';
import {
  AffineEditorViewExtension,
  type AffineEditorViewOptions,
} from '@affine/core/blocksuite/manager/editor-view';
import { DatabaseViewExtension } from '@blocksuite/affine/blocks/database/view';
import { ParagraphViewExtension } from '@blocksuite/affine/blocks/paragraph/view';
import { ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import { LinkedDocViewExtension } from '@blocksuite/affine/widgets/linked-doc/view';
import type { FrameworkProvider } from '@toeverything/infra';

import { CodeBlockPreviewExtensionProvider } from './code-block-preview';

const manager = new ViewExtensionManager([
  ...getInternalViewExtensions(),

  AffineCommonViewExtension,
  AffineEditorViewExtension,
  CodeBlockPreviewExtensionProvider,
]);

export function getViewManager(
  framework?: FrameworkProvider,
  enableAI?: boolean,
  options?: AffineEditorViewOptions
) {
  manager.configure(AffineCommonViewExtension, {
    framework,
    enableAI,
  });
  manager.configure(AffineEditorViewExtension, options);

  if (framework) {
    manager.configure(
      DatabaseViewExtension,
      createDatabaseOptionsConfig(framework)
    );
    manager.configure(
      LinkedDocViewExtension,
      createLinkedWidgetConfig(framework)
    );
  }

  if (enableAI) {
    manager.configure(ParagraphViewExtension, {
      getPlaceholder: model => {
        const placeholders = {
          text: "Type '/' for commands, 'space' for AI",
          h1: 'Heading 1',
          h2: 'Heading 2',
          h3: 'Heading 3',
          h4: 'Heading 4',
          h5: 'Heading 5',
          h6: 'Heading 6',
          quote: '',
        };
        return placeholders[model.props.type] ?? '';
      },
    });
  }
  return manager;
}
