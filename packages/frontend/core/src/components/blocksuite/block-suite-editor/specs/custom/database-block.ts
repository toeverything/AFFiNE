import { notify } from '@affine/component';
import {
  generateUrl,
  type UseSharingUrl,
} from '@affine/core/components/hooks/affine/use-share-url';
import { getAffineCloudBaseUrl } from '@affine/core/modules/cloud/services/fetch';
import { EditorService } from '@affine/core/modules/editor';
import { I18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DatabaseBlockModel, MenuOptions } from '@blocksuite/blocks';
import { LinkIcon } from '@blocksuite/icons/lit';
import type { FrameworkProvider } from '@toeverything/infra';
import type { TemplateResult } from 'lit';

export function createDatabaseOptionsConfig(framework: FrameworkProvider) {
  return {
    configure: (model: DatabaseBlockModel, options: MenuOptions) => {
      const items = options.items;

      const copyIndex = items.findIndex(
        item => item.type === 'action' && item.name === 'Copy'
      );

      items.splice(
        copyIndex + 1,
        0,
        createCopyLinkToBlockMenuItem(framework, model)
      );

      return options;
    },
  };
}

function createCopyLinkToBlockMenuItem(
  framework: FrameworkProvider,
  model: DatabaseBlockModel
): {
  type: 'action';
  name: string;
  icon?: TemplateResult<1>;
  hide?: () => boolean;
  select: () => void;
} {
  return {
    type: 'action',
    name: 'Copy link to block',
    icon: LinkIcon({ width: '20', height: '20' }),
    hide: () => {
      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;
      return mode === 'edgeless';
    },
    select: () => {
      const baseUrl = getAffineCloudBaseUrl();
      if (!baseUrl) return;

      const pageId = model.doc.id;
      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;

      if (mode === 'edgeless') return;

      const workspaceId = editor.doc.workspace.id;
      const options: UseSharingUrl = {
        workspaceId,
        pageId,
        shareMode: mode,
        blockIds: [model.id],
      };

      const str = generateUrl(options);
      if (!str) return;

      const type = model.flavour;
      const page = editor.editorContainer$.value;

      page?.host?.std.clipboard
        .writeToClipboard(items => {
          items['text/plain'] = str;
          // wrap a link
          items['text/html'] = `<a href="${str}">${str}</a>`;
          return items;
        })
        .then(() => {
          track.doc.editor.toolbar.copyBlockToLink({ type });
          notify.success({ title: I18n['Copied link to clipboard']() });
        })
        .catch(console.error);
    },
  };
}
