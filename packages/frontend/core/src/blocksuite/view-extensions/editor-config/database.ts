import { notify } from '@affine/component';
import {
  generateUrl,
  type UseSharingUrl,
} from '@affine/core/components/hooks/affine/use-share-url';
import { ServerService } from '@affine/core/modules/cloud';
import { EditorService } from '@affine/core/modules/editor';
import { copyLinkToBlockStdScopeClipboard } from '@affine/core/utils/clipboard';
import { I18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  menu,
  type MenuOptions,
} from '@blocksuite/affine/components/context-menu';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { LinkIcon } from '@blocksuite/icons/lit';
import type { FrameworkProvider } from '@toeverything/infra';

export function createDatabaseOptionsConfig(framework: FrameworkProvider) {
  return {
    configure: (model: DatabaseBlockModel, options: MenuOptions) => {
      const items = options.items;

      items.splice(2, 0, createCopyLinkToBlockMenuItem(framework, model));

      return options;
    },
  };
}

function createCopyLinkToBlockMenuItem(
  framework: FrameworkProvider,
  model: DatabaseBlockModel
) {
  return menu.action({
    name: 'Copy link to block',
    prefix: LinkIcon({ width: '20', height: '20' }),
    hide: () => {
      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;
      return mode === 'edgeless';
    },
    select: () => {
      const serverService = framework.get(ServerService);
      const pageId = model.store.id;
      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;

      if (mode === 'edgeless') return;

      const workspaceId = editor.doc.workspace.id;
      const options: UseSharingUrl = {
        workspaceId,
        pageId,
        mode,
        blockIds: [model.id],
      };

      const str = generateUrl({
        ...options,
        baseUrl: serverService.server.baseUrl,
      });
      if (!str) return;

      const type = model.flavour;
      const page = editor.editorContainer$.value;

      copyLinkToBlockStdScopeClipboard(str, page?.host?.std.clipboard)
        .then(success => {
          if (!success) return;

          notify.success({ title: I18n['Copied link to clipboard']() });
        })
        .catch(console.error);

      track.doc.editor.toolbar.copyBlockToLink({ type });
    },
  });
}
