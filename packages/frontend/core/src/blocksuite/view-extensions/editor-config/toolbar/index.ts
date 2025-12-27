import { notify } from '@affine/component';
import {
  generateUrl,
  type UseSharingUrl,
} from '@affine/core/components/hooks/affine/use-share-url';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { EditorService } from '@affine/core/modules/editor';
import type { EditorSettingExt } from '@affine/core/modules/editor-setting/entities/editor-setting';
import { copyLinkToBlockStdScopeClipboard } from '@affine/core/utils/clipboard';
import { I18n, i18nTime } from '@affine/i18n';
import { track } from '@affine/track';
import { BookmarkBlockComponent } from '@blocksuite/affine/blocks/bookmark';
import {
  EmbedFigmaBlockComponent,
  EmbedGithubBlockComponent,
  EmbedIframeBlockComponent,
  EmbedLoomBlockComponent,
  EmbedYoutubeBlockComponent,
  getDocContentWithMaxLength,
} from '@blocksuite/affine/blocks/embed';
import {
  EmbedLinkedDocBlockComponent,
  EmbedSyncedDocBlockComponent,
} from '@blocksuite/affine/blocks/embed-doc';
import { SurfaceRefBlockComponent } from '@blocksuite/affine/blocks/surface-ref';
import { toggleEmbedCardEditModal } from '@blocksuite/affine/components/embed-card-modal';
import { notifyLinkedDocClearedAliases } from '@blocksuite/affine/components/notification';
import { isPeekable, peek } from '@blocksuite/affine/components/peek';
import { toast } from '@blocksuite/affine/components/toast';
import {
  EditorChevronDown,
  type MenuContext,
  type MenuItemGroup,
} from '@blocksuite/affine/components/toolbar';
import { watch } from '@blocksuite/affine/global/lit';
import {
  AffineReference,
  toggleReferencePopup,
} from '@blocksuite/affine/inlines/reference';
import {
  BookmarkBlockModel,
  EmbedIframeBlockModel,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  SurfaceRefBlockSchema,
} from '@blocksuite/affine/model';
import { getSelectedModelsCommand } from '@blocksuite/affine/shared/commands';
import { ImageSelection } from '@blocksuite/affine/shared/selection';
import {
  ActionPlacement,
  CitationProvider,
  GenerateDocUrlProvider,
  isRemovedUserInfo,
  OpenDocExtensionIdentifier,
  type OpenDocMode,
  type ToolbarAction,
  type ToolbarActionGenerator,
  type ToolbarActionGroupGenerator,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
  UserProvider,
} from '@blocksuite/affine/shared/services';
import { matchModels } from '@blocksuite/affine/shared/utils';
import {
  BlockFlavourIdentifier,
  BlockSelection,
  TextSelection,
} from '@blocksuite/affine/std';
import {
  GfxBlockElementModel,
  GfxPrimitiveElementModel,
} from '@blocksuite/affine/std/gfx';
import type { ExtensionType } from '@blocksuite/affine/store';
import {
  CopyAsImgaeIcon,
  CopyIcon,
  EditIcon,
  LinkIcon,
  OpenInNewIcon,
} from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import type { FrameworkProvider } from '@toeverything/infra';
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { openDocActions } from '../../editor-view/open-doc';
import { copyAsImage, createCopyAsPngMenuItem } from './copy-as-image';

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

        clipboardGroup.items.splice(
          copyIndex + 1,
          0,
          createCopyAsPngMenuItem(framework)
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

      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;

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
    action: async (ctx: MenuContext) => {
      const workspaceServerService = framework.get(WorkspaceServerService);

      const { editor } = framework.get(EditorService);
      const mode = editor.mode$.value;
      const pageId = editor.doc.id;
      const workspaceId = editor.doc.workspace.id;
      const options: UseSharingUrl = { workspaceId, pageId, mode };
      let type = '';

      if (mode === 'page') {
        // maybe multiple blocks
        const blockIds = ctx.selectedBlockModels.map(model => model.id);
        options.blockIds = blockIds;
        type = ctx.selectedBlockModels[0].flavour;
      } else if (mode === 'edgeless' && ctx.firstElement) {
        // single block/element
        const id = ctx.firstElement.id;
        if (ctx.isElement()) {
          options.elementIds = [id];
          type = (ctx.firstElement as GfxPrimitiveElementModel).type;
        } else {
          options.blockIds = [id];
          type = (ctx.firstElement as GfxBlockElementModel).flavour;
        }
      }

      const str = generateUrl({
        ...options,
        baseUrl: workspaceServerService.server?.baseUrl ?? location.origin,
      });
      if (!str) {
        ctx.close();
        return;
      }

      const success = await copyLinkToBlockStdScopeClipboard(
        str,
        ctx.std.clipboard
      );

      if (success) {
        notify.success({ title: I18n['Copied link to clipboard']() });
      }

      track.doc.editor.toolbar.copyBlockToLink({ type });

      ctx.close();
    },
  };
}

function createToolbarMoreMenuConfigV2(baseUrl?: string) {
  return {
    actions: [
      {
        placement: ActionPlacement.More,
        id: 'a.clipboard',
        actions: [
          {
            id: 'copy-as-image',
            label: 'Copy as Image',
            icon: CopyAsImgaeIcon(),
            when: ({ isEdgelessMode, gfx, flags }) =>
              !flags.isHovering() &&
              isEdgelessMode &&
              gfx.selection.selectedElements.length > 0,
            run: ({ std }) => {
              copyAsImage(std);
            },
          },
          {
            id: 'copy-link-to-block',
            label: 'Copy link to block',
            icon: LinkIcon(),
            when: ({ isPageMode, selection, gfx, flags }) => {
              if (flags.isHovering()) return false;

              const items = selection
                .getGroup('note')
                .filter(item =>
                  [TextSelection, BlockSelection, ImageSelection].some(t =>
                    item.is(t)
                  )
                );
              const hasNoteSelection = items.length > 0;

              if (isPageMode) {
                const item = items[0];
                if (item && item.is(TextSelection)) {
                  return (
                    !item.isCollapsed() &&
                    Boolean(item.from.length + (item.to?.length ?? 0))
                  );
                }
                return hasNoteSelection;
              }

              // Linking blocks in notes is currently not supported under edgeless.
              if (hasNoteSelection) return false;

              // Linking single block/element in edgeless mode.
              return gfx.selection.selectedElements.length === 1;
            },
            run({ isPageMode, std, store, gfx, workspace, editorMode }) {
              const pageId = store.doc.id;
              const mode = editorMode;
              const workspaceId = workspace.id;
              const options: UseSharingUrl = { workspaceId, pageId, mode };
              let type = '';

              if (isPageMode) {
                const [ok, { selectedModels = [] }] = std.command.exec(
                  getSelectedModelsCommand
                );

                if (!ok || !selectedModels.length) return;

                options.blockIds = selectedModels.map(model => model.id);
                type = selectedModels[0].flavour;
              } else {
                const firstElement = gfx.selection.firstElement;
                if (!firstElement) return;

                const ids = [firstElement.id];
                if (firstElement instanceof GfxPrimitiveElementModel) {
                  type = firstElement.type;
                  options.elementIds = ids;
                } else if (firstElement instanceof GfxBlockElementModel) {
                  type = firstElement.flavour;
                  options.blockIds = ids;
                }
              }

              if (!type) return;

              const str = generateUrl({
                ...options,
                baseUrl: baseUrl ?? location.origin,
              });

              if (!str) return;

              copyLinkToBlockStdScopeClipboard(str, std.clipboard)
                .then(ok => {
                  if (!ok) return;

                  notify.success({ title: I18n['Copied link to clipboard']() });
                })
                .catch(console.error);

              track.doc.editor.toolbar.copyBlockToLink({ type });
            },
          },
        ],
      },
      {
        placement: ActionPlacement.More,
        id: 'z.block-meta',
        actions: [
          {
            id: 'block-meta-display',
            when: ctx => {
              const isEnabled = ctx.features.getFlag('enable_block_meta');
              if (!isEnabled) return false;

              // only display when one block is selected by block selection
              const hasBlockSelection =
                ctx.selection.filter(BlockSelection).length === 1;
              if (!hasBlockSelection) return false;
              const model = ctx.getCurrentModelBy(BlockSelection);
              if (!model) return false;

              const createdAt = 'meta:createdAt';
              const createdBy = 'meta:createdBy';
              return (
                'props' in model &&
                createdAt in model.props &&
                model.props[createdAt] !== undefined &&
                createdBy in model.props &&
                model.props[createdBy] !== undefined &&
                typeof model.props[createdBy] === 'string' &&
                typeof model.props[createdAt] === 'number'
              );
            },
            content: ctx => {
              const model = ctx.getCurrentModelBy(BlockSelection);
              if (!model) return null;
              if (!('props' in model)) return null;
              const createdAt = 'meta:createdAt';
              if (!(createdAt in model.props)) return null;
              const createdBy = 'meta:createdBy';
              if (!(createdBy in model.props)) return null;
              const createdByUserId = model.props[createdBy] as string;
              const createdAtTimestamp = model.props[createdAt] as number;
              const date = new Date(createdAtTimestamp);
              const userProvider = ctx.std.getOptional(UserProvider);
              if (!userProvider) return null;
              userProvider.revalidateUserInfo(createdByUserId);
              const userSignal = userProvider.userInfo$(createdByUserId);
              const isLoadingSignal = userProvider.isLoading$(createdByUserId);
              const name = computed(() => {
                const value = userSignal.value;
                if (!value) {
                  if (isLoadingSignal.value) {
                    // if user info is loading
                    return '';
                  }
                  return I18n['Unknown User']();
                }
                const removed = isRemovedUserInfo(value);
                if (removed) {
                  return I18n['Deleted User']();
                }
                return value.name;
              });
              const user = computed(() => {
                return I18n.t('com.affine.page.toolbar.created_by', {
                  name: name.value,
                });
              });
              const createdAtString = i18nTime(date.toISOString(), {
                absolute: {
                  accuracy: 'minute',
                },
              });
              const wrapperStyle = {
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: '400',
              };
              return html`<div style=${styleMap(wrapperStyle)}>
                <div>${watch(user)}</div>
                <div>${createdAtString}</div>
              </div>`;
            },
          },
        ],
      },
    ],

    when: ctx => !ctx.getSurfaceModels().some(model => model.isLocked()),
  } as const satisfies ToolbarModuleConfig;
}

function createExternalLinkableToolbarConfig(
  klass:
    | typeof BookmarkBlockComponent
    | typeof EmbedFigmaBlockComponent
    | typeof EmbedGithubBlockComponent
    | typeof EmbedLoomBlockComponent
    | typeof EmbedYoutubeBlockComponent
) {
  return {
    actions: [
      {
        id: 'a.preview.after.copy-link-and-edit',
        actions: [
          {
            id: 'copy-link',
            tooltip: 'Copy link',
            icon: CopyIcon(),
            run(ctx) {
              const model = ctx.getCurrentBlockByType(klass)?.model;
              if (!model) return;

              const { url } = model.props;

              navigator.clipboard.writeText(url).catch(console.error);
              toast(ctx.host, 'Copied link to clipboard');

              ctx.track('CopiedLink', {
                category: matchModels(model, [BookmarkBlockModel])
                  ? 'bookmark'
                  : 'link',
                type: 'card view',
                control: 'copy link',
              });
            },
          },
          {
            id: 'edit',
            tooltip: 'Edit Description',
            icon: EditIcon(),
            run(ctx) {
              const block = ctx.getCurrentBlockByType(klass);
              if (!block) return;

              ctx.hide();

              const model = block.model;
              const abortController = new AbortController();
              abortController.signal.onabort = () => ctx.show();

              toggleEmbedCardEditModal(
                ctx.host,
                model,
                'card',
                undefined,
                undefined,
                (_std, _component, props) => {
                  ctx.store.updateBlock(model, props);
                  block.requestUpdate();
                  const citationService = ctx.std.get(CitationProvider);
                  if (citationService.isCitationModel(model)) {
                    citationService.trackEvent('Edit');
                  }
                },
                abortController
              );

              ctx.track('OpenedAliasPopup', {
                category: matchModels(model, [BookmarkBlockModel])
                  ? 'bookmark'
                  : 'link',
                type: 'card view',
                control: 'edit',
              });
            },
          },
        ],
      },
    ],
  } as const satisfies ToolbarModuleConfig;
}

function createOpenDocActions(
  ctx: ToolbarContext,
  target:
    | EmbedLinkedDocBlockComponent
    | EmbedSyncedDocBlockComponent
    | AffineReference
    | SurfaceRefBlockComponent,
  isSameDoc: boolean,
  actions = openDocActions.map(
    ({ type: mode, label, icon, enabled: when, shortcut }, i) => ({
      mode,
      id: `${i}.${mode}`,
      label,
      icon,
      when,
      shortcut,
    })
  )
) {
  return actions
    .filter(action => action.when)
    .map<ToolbarActionGenerator & { mode: OpenDocMode; shortcut?: string }>(
      action => {
        const openMode = action.mode;
        const shouldOpenInCenterPeek = openMode === 'open-in-center-peek';
        const shouldOpenInActiveView = openMode === 'open-in-active-view';

        return {
          ...action,
          generate(ctx) {
            const disabled = shouldOpenInActiveView ? isSameDoc : false;

            const when =
              ctx.std.get(OpenDocExtensionIdentifier).isAllowed(openMode) &&
              (shouldOpenInCenterPeek ? isPeekable(target) : true);

            const run = shouldOpenInCenterPeek
              ? (_ctx: ToolbarContext) => peek(target)
              : (_ctx: ToolbarContext) => target.open({ openMode });

            return { disabled, when, run };
          },
        };
      }
    )
    .filter(action => {
      if (typeof action.when === 'function') return action.when(ctx);
      return action.when ?? true;
    });
}

function createOpenDocActionGroup(
  klass:
    | typeof EmbedLinkedDocBlockComponent
    | typeof EmbedSyncedDocBlockComponent,
  settings: EditorSettingExt
): ToolbarAction {
  return {
    placement: ActionPlacement.Start,
    id: 'A.open-doc',
    content(ctx) {
      const block = ctx.getCurrentBlockByType(klass);
      if (!block) return null;

      return renderOpenDocMenu(
        settings,
        ctx,
        block,
        block.model.props.pageId === ctx.store.id
      );
    },
  };
}

function createEdgelessOpenDocActionGroup(
  klass:
    | typeof EmbedLinkedDocBlockComponent
    | typeof EmbedSyncedDocBlockComponent
): ToolbarActionGroupGenerator {
  return {
    placement: ActionPlacement.More,
    id: 'Z.c.open-doc',
    generate(ctx) {
      const block = ctx.getCurrentBlockByType(klass);
      if (!block) return null;

      const actions = createOpenDocActions(
        ctx,
        block,
        block.model.props.pageId === ctx.store.id
      ).map(action => ({ ...action, ...action.generate(ctx) }));

      return { actions };
    },
  };
}

function createSurfaceRefToolbarConfig(baseUrl?: string): ToolbarModuleConfig {
  return {
    actions: [
      {
        id: 'b.open-surface-ref',
        when: ctx =>
          !!ctx.getCurrentBlockByType(SurfaceRefBlockComponent)?.referenceModel,
        content: ctx => {
          const surfaceRefBlock = ctx.getCurrentBlockByType(
            SurfaceRefBlockComponent
          );
          if (!surfaceRefBlock) return null;

          const actions = createOpenDocActions(ctx, surfaceRefBlock, false)
            .map(action => ({
              ...action,
              ...action.generate(ctx),
            }))
            .map(action => {
              if (action.id.endsWith('open-in-active-view')) {
                action.label =
                  I18n['com.affine.peek-view-controls.open-doc-in-edgeless']();
              }
              return action;
            });
          if (!actions.length) return null;

          const styles = styleMap({
            gap: 4,
          });

          return html`${keyed(
            surfaceRefBlock,
            html`<editor-menu-button
              aria-label="Open"
              .contentPadding=${'8px'}
              .button=${html`<editor-icon-button
                .iconSize=${'16px'}
                .iconContainerPadding=${4}
              >
                ${OpenInNewIcon()} ${EditorChevronDown}
              </editor-icon-button>`}
            >
              <div data-orientation="vertical" style=${styles}>
                ${repeat(
                  actions,
                  action => action.id,
                  ({ label, icon, run, disabled }) => html`
                    <editor-menu-action
                      aria-label=${ifDefined(label)}
                      ?disabled=${disabled}
                      @click=${() => {
                        run?.(ctx);
                      }}
                    >
                      ${icon}<span class="label">${label}</span>
                    </editor-menu-action>
                  `
                )}
              </div>
            </editor-menu-button>`
          )}`;
        },
      },
      {
        id: 'a.clipboard',
        placement: ActionPlacement.More,
        actions: [
          {
            id: 'copy-link-to-surface-ref',
            label: 'Copy original link',
            icon: LinkIcon(),
            when: ctx =>
              !!ctx.getCurrentBlockByType(SurfaceRefBlockComponent)
                ?.referenceModel,
            run: ctx => {
              const surfaceRefBlock = ctx.getCurrentBlockByType(
                SurfaceRefBlockComponent
              );
              if (!surfaceRefBlock) return;

              const refModel = surfaceRefBlock.referenceModel;
              if (!refModel) return;

              const { store, workspace, std } = ctx;
              const pageId = store.doc.id;
              const workspaceId = workspace.id;
              const options: UseSharingUrl = {
                workspaceId,
                pageId,
                mode: 'edgeless',
              };

              let type = '';
              if (refModel instanceof GfxPrimitiveElementModel) {
                options.elementIds = [refModel.id];
                type = refModel.type;
              } else if (refModel instanceof GfxBlockElementModel) {
                options.blockIds = [refModel.id];
                type = refModel.flavour;
              }

              const str = generateUrl({
                ...options,
                baseUrl: baseUrl ?? location.origin,
              });
              if (!str) return;

              copyLinkToBlockStdScopeClipboard(str, std.clipboard)
                .then(ok => {
                  if (!ok) return;

                  notify.success({ title: I18n['Copied link to clipboard']() });
                })
                .catch(console.error);

              track.doc.editor.toolbar.copyBlockToLink({ type });
            },
          },
        ],
      },
    ],

    when: ctx => ctx.isPageMode,
  };
}

function renderOpenDocMenu(
  settings: EditorSettingExt,
  ctx: ToolbarContext,
  target:
    | EmbedLinkedDocBlockComponent
    | EmbedSyncedDocBlockComponent
    | AffineReference,
  isSameDoc: boolean
) {
  const actions = createOpenDocActions(ctx, target, isSameDoc).map(action => ({
    ...action,
    ...action.generate(ctx),
  }));
  if (!actions.length) return null;

  const openDocMode = computed(
    () => settings.settingSignal.value.openDocMode ?? 'open-in-active-view'
  );
  const updateOpenDocMode = (mode: OpenDocMode) =>
    settings.openDocMode.set(mode);

  return html`${keyed(
    target,
    html`
      <affine-open-doc-dropdown-menu
        .actions=${actions}
        .context=${ctx}
        .openDocMode$=${openDocMode}
        .updateOpenDocMode=${updateOpenDocMode}
      >
      </affine-open-doc-dropdown-menu>
    `
  )}`;
}

const embedLinkedDocToolbarConfig = {
  actions: [
    {
      id: 'a.doc-title.after.copy-link-and-edit',
      actions: [
        {
          id: 'copy-link',
          tooltip: 'Copy link',
          icon: CopyIcon(),
          run(ctx) {
            const model = ctx.getCurrentModelByType(EmbedLinkedDocModel);
            if (!model) return;

            const { pageId, params } = model.props;

            const url = ctx.std
              .getOptional(GenerateDocUrlProvider)
              ?.generateDocUrl(pageId, params);

            if (!url) return;

            navigator.clipboard.writeText(url).catch(console.error);
            toast(ctx.host, 'Copied link to clipboard');

            ctx.track('CopiedLink', {
              category: 'linked doc',
              type: 'card view',
              control: 'copy link',
            });
          },
        },
        {
          id: 'edit',
          tooltip: 'Edit Description',
          icon: EditIcon(),
          run(ctx) {
            const block = ctx.getCurrentBlockByType(
              EmbedLinkedDocBlockComponent
            );
            if (!block) return;

            ctx.hide();

            const model = block.model;
            const doc = ctx.workspace.getDoc(model.props.pageId)?.getStore();
            const abortController = new AbortController();
            abortController.signal.onabort = () => ctx.show();

            toggleEmbedCardEditModal(
              ctx.host,
              model,
              'card',
              doc
                ? {
                    title: doc.meta?.title,
                    description: getDocContentWithMaxLength(doc),
                  }
                : undefined,
              std => {
                block.refreshData();
                notifyLinkedDocClearedAliases(std);
              },
              (_std, _component, props) => {
                ctx.store.updateBlock(model, props);
                block.requestUpdate();
                const citationService = ctx.std.get(CitationProvider);
                if (citationService.isCitationModel(model)) {
                  citationService.trackEvent('Edit');
                }
              },
              abortController
            );

            ctx.track('OpenedAliasPopup', {
              category: 'linked doc',
              type: 'embed view',
              control: 'edit',
            });
          },
        },
      ],
    },
  ],
} as const satisfies ToolbarModuleConfig;

const embedSyncedDocToolbarConfig = {
  actions: [
    {
      placement: ActionPlacement.Start,
      id: 'B.copy-link-and-edit',
      actions: [
        {
          id: 'copy-link',
          tooltip: 'Copy link',
          icon: CopyIcon(),
          run(ctx) {
            const model = ctx.getCurrentModelByType(EmbedSyncedDocModel);
            if (!model) return;

            const { pageId, params } = model.props;

            const url = ctx.std
              .getOptional(GenerateDocUrlProvider)
              ?.generateDocUrl(pageId, params);

            if (!url) return;

            navigator.clipboard.writeText(url).catch(console.error);
            toast(ctx.host, 'Copied link to clipboard');

            ctx.track('CopiedLink', {
              category: 'linked doc',
              type: 'embed view',
              control: 'copy link',
            });
          },
        },
      ],
    },
  ],
} as const satisfies ToolbarModuleConfig;

const inlineReferenceToolbarConfig = {
  actions: [
    {
      id: 'b.copy-link-and-edit',
      actions: [
        {
          id: 'copy-link',
          tooltip: 'Copy link',
          icon: CopyIcon(),
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineReference)) return;

            const { pageId, params } = target.referenceInfo;

            const url = ctx.std
              .getOptional(GenerateDocUrlProvider)
              ?.generateDocUrl(pageId, params);

            if (!url) return;

            // Clears
            ctx.reset();

            navigator.clipboard.writeText(url).catch(console.error);
            toast(ctx.host, 'Copied link to clipboard');

            ctx.track('CopiedLink', {
              category: 'linked doc',
              type: 'inline view',
              control: 'copy link',
            });
          },
        },
        {
          id: 'edit',
          tooltip: 'Edit Description',
          icon: EditIcon(),
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineReference)) return;

            // Clears
            ctx.reset();

            const { inlineEditor, selfInlineRange, docTitle, referenceInfo } =
              target;
            if (!inlineEditor || !selfInlineRange) return;

            const abortController = new AbortController();
            const popover = toggleReferencePopup(
              ctx.std,
              docTitle,
              referenceInfo,
              inlineEditor,
              selfInlineRange,
              abortController
            );
            abortController.signal.onabort = () => popover.remove();

            ctx.track('OpenedAliasPopup', {
              category: 'linked doc',
              type: 'inline view',
              control: 'edit',
            });
          },
        },
      ],
    },
  ],
} as const satisfies ToolbarModuleConfig;

const embedIframeToolbarConfig = {
  when: (ctx: ToolbarContext) => {
    const model = ctx.getCurrentModelByType(EmbedIframeBlockModel);
    if (!model) return false;

    return !!model.props.url;
  },
  actions: [
    {
      id: 'b.copy-link',
      actions: [
        {
          id: 'copy-link',
          tooltip: 'Copy original link',
          icon: CopyIcon(),
          run(ctx) {
            const model = ctx.getCurrentBlockByType(
              EmbedIframeBlockComponent
            )?.model;
            if (!model) return;

            const { url } = model.props;

            navigator.clipboard.writeText(url).catch(console.error);
            toast(ctx.host, 'Copied link to clipboard');

            ctx.track('CopiedLink', {
              category: matchModels(model, [EmbedIframeBlockModel])
                ? 'embed iframe block'
                : 'link',
              type: 'card view',
              control: 'copy link',
            });
          },
        },
      ],
    },
  ],
} as const satisfies ToolbarModuleConfig;

export const createCustomToolbarExtension = (
  settings: EditorSettingExt,
  baseUrl: string
): ExtensionType[] => {
  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:*'),
      config: createToolbarMoreMenuConfigV2(baseUrl),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:bookmark'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:bookmark'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-figma'),
      config: createExternalLinkableToolbarConfig(EmbedFigmaBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-figma'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-github'),
      config: createExternalLinkableToolbarConfig(EmbedGithubBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-github'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-loom'),
      config: createExternalLinkableToolbarConfig(EmbedLoomBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-loom'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-youtube'),
      config: createExternalLinkableToolbarConfig(EmbedYoutubeBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-youtube'),
      config: createExternalLinkableToolbarConfig(BookmarkBlockComponent),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-linked-doc'),
      config: {
        actions: [
          embedLinkedDocToolbarConfig.actions,
          createOpenDocActionGroup(EmbedLinkedDocBlockComponent, settings),
        ].flat(),
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-linked-doc'),
      config: {
        actions: [
          embedLinkedDocToolbarConfig.actions,
          createOpenDocActionGroup(EmbedLinkedDocBlockComponent, settings),
          createEdgelessOpenDocActionGroup(EmbedLinkedDocBlockComponent),
        ].flat(),

        when: ctx => ctx.getSurfaceModels().length === 1,
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-synced-doc'),
      config: {
        actions: [
          embedSyncedDocToolbarConfig.actions,
          createOpenDocActionGroup(EmbedSyncedDocBlockComponent, settings),
        ].flat(),
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-synced-doc'),
      config: {
        actions: [
          // the open actions are provided by the header of embed-edgeless-synced-doc-block
          {
            id: 'A.open-doc',
            when: () => false,
          },
        ].flat(),
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:reference'),
      config: {
        actions: [
          {
            placement: ActionPlacement.Start,
            id: 'A.open-doc',
            content(ctx) {
              const target = ctx.message$.peek()?.element;
              if (!(target instanceof AffineReference)) return null;

              return renderOpenDocMenu(
                settings,
                ctx,
                target,
                target.referenceInfo.pageId === ctx.store.id
              );
            },
          } as const satisfies ToolbarAction,
          inlineReferenceToolbarConfig.actions,
        ].flat(),
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:embed-iframe'),
      config: embedIframeToolbarConfig,
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier('custom:affine:surface:embed-iframe'),
      config: {
        actions: [embedIframeToolbarConfig.actions].flat(),

        when: ctx => ctx.getSurfaceModels().length === 1,
      },
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(
        `custom:${SurfaceRefBlockSchema.model.flavour}`
      ),
      config: createSurfaceRefToolbarConfig(baseUrl),
    }),
  ];
};
