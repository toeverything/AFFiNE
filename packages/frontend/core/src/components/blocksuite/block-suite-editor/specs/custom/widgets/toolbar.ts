import { notify } from '@affine/component';
import {
  generateUrl,
  type UseSharingUrl,
} from '@affine/core/hooks/affine/use-share-url';
import { getAffineCloudBaseUrl } from '@affine/core/modules/cloud/services/fetch';
import { I18n } from '@affine/i18n';
import type { MenuItemGroup } from '@blocksuite/affine-components/toolbar';
import { DocMode, type MenuContext } from '@blocksuite/blocks';
import { LinkIcon } from '@blocksuite/icons/lit';
import {
  DocsService,
  type FrameworkProvider,
  WorkspaceService,
} from '@toeverything/infra';

export function createToolbarMoreMenuConfig(framework: FrameworkProvider) {
  return {
    configure: <T extends MenuContext>(groups: MenuItemGroup<T>[]) => {
      const clipboardGroup = groups.find(group => group.type === 'clipboard');

      if (clipboardGroup) {
        let copyIndex = clipboardGroup.items.findIndex(
          item => item.type === 'copy'
        );
        if (copyIndex === -1) {
          copyIndex = clipboardGroup.items.findIndex(
            item => item.type === 'duplicate'
          );
          if (copyIndex !== -1) {
            copyIndex -= 1;
          }
        }

        // after `copy` or before `duplicate`
        clipboardGroup.items.splice(
          copyIndex + 1,
          0,
          createCopyLinkToBlockMenuItem(framework)
        );
      }

      return groups;
    },
  };
}

function createCopyLinkToBlockMenuItem(
  framework: FrameworkProvider,
  item = {
    icon: LinkIcon({ width: '20', height: '20' }),
    label: 'Copy link to block',
    type: 'copy-link-to-block',
    when: (ctx: MenuContext) => {
      if (ctx.isEmpty()) return false;

      const docsService = framework.get(DocsService);
      const mode = docsService.list.getPrimaryMode(ctx.doc.id) || DocMode.Page;

      if (mode === 'edgeless') {
        // linking blocks in notes is currently not supported in edgeless mode.
        if (ctx.selectedBlockModels.length > 0) {
          return false;
        }

        // linking single block/element in edgeless mode.
        if (ctx.isMultiple()) {
          return false;
        }
      }

      return true;
    },
  }
) {
  return {
    ...item,
    action: (ctx: MenuContext) => {
      const baseUrl = getAffineCloudBaseUrl();
      if (!baseUrl) {
        ctx.close();
        return;
      }

      const pageId = ctx.doc.id;
      const workspace = framework.get(WorkspaceService).workspace;
      const docsService = framework.get(DocsService);
      const mode = docsService.list.getPrimaryMode(pageId) || DocMode.Page;
      const workspaceId = workspace.id;
      const options: UseSharingUrl = { workspaceId, pageId, shareMode: mode };

      if (mode === 'page') {
        // maybe multiple blocks
        const blockIds = ctx.selectedBlockModels.map(model => model.id);
        options.blockIds = blockIds;
      } else if (mode === 'edgeless' && ctx.firstElement) {
        // single block/element
        const id = ctx.firstElement.id;
        const key = ctx.isElement() ? 'element' : 'block';
        options[`${key}Ids`] = [id];
      }

      const str = generateUrl(options);
      if (!str) {
        ctx.close();
        return;
      }

      navigator.clipboard
        .writeText(str)
        .then(() => {
          notify.success({
            title: I18n['Copied link to clipboard'](),
          });
        })
        .catch(console.error);

      ctx.close();
    },
  };
}
