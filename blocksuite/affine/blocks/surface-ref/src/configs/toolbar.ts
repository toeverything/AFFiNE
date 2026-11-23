import { toast } from '@blocksuite/affine-components/toast';
import {
  copySelectedModelsCommand,
  draftSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import {
  ActionPlacement,
  blockCommentToolbarButton,
  type ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import { CaptionIcon, CopyIcon, DeleteIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { SurfaceRefBlockComponent } from '../surface-ref-block';

export const surfaceRefToolbarModuleConfig: ToolbarModuleConfig = {
  actions: [
    {
      id: 'a.surface-ref-title',
      when: ctx =>
        !!ctx.getCurrentBlockByType(SurfaceRefBlockComponent)?.referenceModel,
      content: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return null;

        return html`<surface-ref-toolbar-title
          .referenceModel=${surfaceRefBlock.referenceModel}
        ></surface-ref-toolbar-title>`;
      },
    },
    {
      id: 'c.copy-surface-ref',
      label: 'Copy',
      icon: CopyIcon(),
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        ctx.chain
          .pipe(draftSelectedModelsCommand, {
            selectedModels: [surfaceRefBlock.model],
          })
          .pipe(copySelectedModelsCommand)
          .run();

        toast(surfaceRefBlock.std.host, 'Copied to clipboard');
      },
    },
    {
      id: 'd.surface-ref-caption',
      icon: CaptionIcon(),
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        surfaceRefBlock.captionElement.show();
      },
    },
    {
      id: 'e.comment',
      ...blockCommentToolbarButton,
    },
    {
      id: 'a.clipboard',
      placement: ActionPlacement.More,
      when: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlock();
        if (!(surfaceRefBlock instanceof SurfaceRefBlockComponent))
          return false;

        return !!surfaceRefBlock.referenceModel;
      },
      actions: [
        // TODO(@L-Sun): add duplicate action after refactoring root-block/edgeless
      ],
    },
    {
      id: 'g.surface-ref-deletion',
      label: 'Delete',
      icon: DeleteIcon(),
      placement: ActionPlacement.More,
      variant: 'destructive',
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        ctx.store.deleteBlock(surfaceRefBlock.model);
      },
    },
  ],
  placement: 'inner',
};
