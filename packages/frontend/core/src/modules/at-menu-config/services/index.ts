import { notify } from '@affine/component';
import { UserFriendlyError } from '@affine/error';
import {
  type DocMode as GraphqlDocMode,
  DocRole,
  ErrorNames,
} from '@affine/graphql';
import { I18n, i18nTime } from '@affine/i18n';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { DocModeProvider } from '@blocksuite/affine/shared/services';
import type { AffineInlineEditor } from '@blocksuite/affine/shared/types';
import {
  BLOCK_ID_ATTR,
  type BlockComponent,
  type EditorHost,
} from '@blocksuite/affine/std';
import type { DocMeta } from '@blocksuite/affine/store';
import {
  type LinkedMenuGroup,
  type LinkedMenuItem,
  type LinkedWidgetConfig,
  LinkedWidgetUtils,
} from '@blocksuite/affine/widgets/linked-doc';
import {
  DateTimeIcon,
  NewXxxEdgelessIcon,
  NewXxxPageIcon,
  UserIcon,
} from '@blocksuite/icons/lit';
import { computed, Signal } from '@preact/signals-core';
import { Service } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { FuseResultMatch } from 'fuse.js';
import Fuse from 'fuse.js';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
} from 'yjs';

import { AuthService, type WorkspaceServerService } from '../../cloud';
import type { WorkspaceDialogService } from '../../dialogs';
import type { DocsService } from '../../doc';
import type { DocDisplayMetaService } from '../../doc-display-meta';
import { type JournalService, suggestJournalDate } from '../../journal';
import { NotificationService } from '../../notification';
import type { GuardService, MemberSearchService } from '../../permissions';
import type { DocGrantedUsersService } from '../../permissions/services/doc-granted-users';
import { highlighter } from '../../quicksearch/utils/highlighter';
import type { SearchMenuService } from '../../search-menu/services';

function resolveSignal<T>(data: T | Signal<T>): T {
  return data instanceof Signal ? data.value : data;
}

const RESERVED_ITEM_KEYS = {
  createPage: 'create:page',
  createEdgeless: 'create:edgeless',
  datePicker: 'date-picker',
};

export class AtMenuConfigService extends Service {
  constructor(
    private readonly journalService: JournalService,
    private readonly docDisplayMetaService: DocDisplayMetaService,
    private readonly dialogService: WorkspaceDialogService,
    private readonly docsService: DocsService,
    private readonly searchMenuService: SearchMenuService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly memberSearchService: MemberSearchService,
    private readonly guardService: GuardService,
    private readonly docGrantedUsersService: DocGrantedUsersService
  ) {
    super();
  }

  // todo(@peng17): maybe refactor the config using entity, so that each config
  // can be reactive to the query, instead of recreating the whole config?
  getConfig(): Partial<LinkedWidgetConfig> {
    return {
      getMenus: this.getMenusFn(),
      mobile: this.getMobileConfig(),
      autoFocusedItemKey: this.autoFocusedItemKey,
    };
  }

  private insertDoc(inlineEditor: AffineInlineEditor, id: string) {
    LinkedWidgetUtils.insertLinkedNode({
      inlineEditor,
      docId: id,
    });
  }

  private readonly autoFocusedItemKey = (
    menus: LinkedMenuGroup[],
    query: string
  ): string | null => {
    if (query.trim().length === 0) {
      return null;
    }

    const linkToDocGroup = menus[0];
    const memberGroup = menus[1];

    if (resolveSignal(memberGroup.items).length > 1) {
      return resolveSignal(memberGroup.items)[0]?.key;
    }

    if (resolveSignal(linkToDocGroup.items).length > 0) {
      return resolveSignal(linkToDocGroup.items)[0]?.key;
    }

    return RESERVED_ITEM_KEYS.createPage;
  };

  private newDocMenuGroup(
    query: string,
    close: () => void,
    editorHost: EditorHost,
    inlineEditor: AffineInlineEditor
  ): LinkedMenuGroup {
    const originalNewDocMenuGroup = LinkedWidgetUtils.createNewDocMenuGroup(
      query,
      close,
      editorHost,
      inlineEditor
    );

    // Patch the import item, to use the custom import dialog.
    const items = Array.isArray(originalNewDocMenuGroup.items)
      ? originalNewDocMenuGroup.items
      : originalNewDocMenuGroup.items.value;

    const importItem = items.find(item => item.key === 'import');

    if (!importItem) {
      return originalNewDocMenuGroup;
    }

    const createPage = (mode: DocMode) => {
      const page = this.docsService.createDoc({
        title: query,
        primaryMode: mode,
      });

      return page;
    };

    const customNewDocItems: LinkedMenuItem[] = [
      {
        key: RESERVED_ITEM_KEYS.createPage,
        icon: NewXxxPageIcon(),
        name: I18n.t('com.affine.editor.at-menu.create-page', {
          name: query || I18n.t('Untitled'),
        }),
        action: () => {
          close();
          const page = createPage('page');
          this.insertDoc(inlineEditor, page.id);
          track.doc.editor.atMenu.createDoc({
            mode: 'page',
          });
        },
      },
      {
        key: RESERVED_ITEM_KEYS.createEdgeless,
        icon: NewXxxEdgelessIcon(),
        name: I18n.t('com.affine.editor.at-menu.create-edgeless', {
          name: query || I18n.t('Untitled'),
        }),
        action: () => {
          close();
          const page = createPage('edgeless');
          this.insertDoc(inlineEditor, page.id);
          track.doc.editor.atMenu.createDoc({
            mode: 'edgeless',
          });
        },
      },
    ];
    const customImportItem: LinkedMenuItem = {
      ...importItem,
      name: I18n.t('com.affine.editor.at-menu.import'),
      action: () => {
        close();
        track.doc.editor.atMenu.import();
        this.dialogService.open('import', undefined, payload => {
          if (!payload) {
            return;
          }

          // If the imported file is a workspace file, insert the entry page node.
          const { docIds, entryId, isWorkspaceFile } = payload;
          if (isWorkspaceFile && entryId) {
            this.insertDoc(inlineEditor, entryId);
            return;
          }

          // Otherwise, insert all the doc nodes.
          for (const docId of docIds) {
            this.insertDoc(inlineEditor, docId);
          }
        });
      },
    };

    return {
      ...originalNewDocMenuGroup,
      name: I18n.t('com.affine.editor.at-menu.new-doc'),
      items: [...customNewDocItems, customImportItem],
    };
  }

  private journalGroup(
    query: string,
    close: () => void,
    inlineEditor: AffineInlineEditor
  ): LinkedMenuGroup {
    const suggestedDate = suggestJournalDate(query);

    const items: LinkedMenuItem[] = [
      {
        icon: DateTimeIcon(),
        key: RESERVED_ITEM_KEYS.datePicker,
        name: I18n.t('com.affine.editor.at-menu.date-picker'),
        action: () => {
          close();

          const getRect = () => {
            if (!inlineEditor.rootElement) {
              return { x: 0, y: 0, width: 0, height: 0 };
            }
            let rect = inlineEditor.getNativeRange()?.getBoundingClientRect();

            if (!rect || rect.width === 0 || rect.height === 0) {
              rect = inlineEditor.rootElement.getBoundingClientRect();
            }

            return rect;
          };

          const { x, y, width, height } = getRect();

          const id = this.dialogService.open('date-selector', {
            position: [x, y, width, height || 20],
            onSelect: date => {
              if (date) {
                onSelectDate(date);
                track.doc.editor.atMenu.linkDoc({
                  journal: true,
                  type: 'specific date',
                });
                this.dialogService.close(id);
              }
            },
          });
        },
      },
    ];

    const onSelectDate = (date: string) => {
      close();
      const doc = this.journalService.ensureJournalByDate(date);
      this.insertDoc(inlineEditor, doc.id);
    };

    if (suggestedDate) {
      const { dateString, alias } = suggestedDate;
      const dateDisplay = i18nTime(dateString, {
        absolute: { accuracy: 'day' },
      });

      const icon = this.docDisplayMetaService.getJournalIcon(dateString, {
        type: 'lit',
      });

      items.unshift({
        icon: icon(),
        key: RESERVED_ITEM_KEYS.datePicker + ':' + dateString,
        name: alias
          ? html`${alias},
              <span style="color: ${cssVarV2('text/secondary')}"
                >${dateDisplay}</span
              >`
          : dateDisplay,
        action: () => {
          track.doc.editor.atMenu.linkDoc({
            journal: true,
            type: alias,
          });
          onSelectDate(dateString);
        },
      });
    }

    return {
      name: I18n.t('com.affine.editor.at-menu.journal'),
      items,
    };
  }

  private linkToDocGroup(
    query: string,
    close: () => void,
    inlineEditor: AffineInlineEditor,
    abortSignal: AbortSignal
  ): LinkedMenuGroup {
    const action = (meta: DocMeta) => {
      close();
      track.doc.editor.atMenu.linkDoc();
      this.insertDoc(inlineEditor, meta.id);
    };
    const result = this.searchMenuService.getDocMenuGroup(
      query,
      action,
      abortSignal
    );
    const filterItem = (item: LinkedMenuItem) => {
      const isJournal = !!this.journalService.journalDate$(item.key).value;
      return !isJournal;
    };
    const items = result.items;
    if (Array.isArray(items)) {
      result.items = items.filter(filterItem);
    } else {
      result.items = computed(() => items.value.filter(filterItem));
    }
    return result;
  }

  private highlightFuseTitle(
    matches: readonly FuseResultMatch[] | undefined,
    title: string,
    key: string
  ): string {
    if (!matches) {
      return title;
    }
    const normalizedRange = ([start, end]: [number, number]) =>
      [
        start,
        end + 1 /* in fuse, the `end` is different from the `substring` */,
      ] as [number, number];
    const titleMatches = matches
      ?.filter(match => match.key === key)
      .flatMap(match => match.indices.map(normalizedRange));
    return (
      highlighter(
        title,
        `<span style="color: ${cssVarV2('text/emphasis')}">`,
        '</span>',
        titleMatches ?? []
      ) ?? title
    );
  }

  private memberGroup(
    query: string,
    close: () => void,
    inlineEditor: AffineInlineEditor,
    _: AbortSignal
  ): LinkedMenuGroup {
    const getMenuItem = (
      id: string,
      name?: string | null,
      avatar?: string | null,
      sendNotification: boolean = true
    ): LinkedMenuItem => {
      const avatarStyle = styleMap({
        borderRadius: '50%',
        border: `1px solid ${cssVarV2('layer/background/overlayPanel')}`,
        width: '20px',
        height: '20px',
        boxSizing: 'border-box',
      });
      const icon = avatar
        ? html`<img style=${avatarStyle} src="${avatar}" />`
        : UserIcon();

      let displayName = name ?? 'Unknown';
      return {
        key: id,
        name: html`${unsafeHTML(displayName)}`,
        icon,
        action: () => {
          const root = inlineEditor.rootElement;
          const block = root?.closest<BlockComponent>(`[${BLOCK_ID_ATTR}]`);
          if (!block) return;

          const notificationService =
            this.workspaceServerService.server?.scope.get(NotificationService);
          if (!notificationService) return;

          const doc = block.store;
          const workspaceId = doc.workspace.id;
          const docId = doc.id;
          const mode = block.std.get(DocModeProvider).getEditorMode() ?? 'page';

          close();

          track.doc.editor.atMenu.mentionMember({
            type: 'member',
          });

          const inlineRange = inlineEditor.getInlineRange();
          if (!inlineRange || inlineRange.length !== 0) return;

          inlineEditor.insertText(inlineRange, ' ', {
            mention: {
              member: id,
            },
          });
          inlineEditor.setInlineRange({
            index: inlineRange.index + 1,
            length: 0,
          });

          if (!sendNotification) return;

          const relativePosition = createRelativePositionFromTypeIndex(
            inlineEditor.yText,
            inlineRange.index + 1
          );
          notificationService
            .mentionUser(id, workspaceId, {
              id: docId,
              title: this.docDisplayMetaService.title$(docId).value,
              blockId: block.blockId,
              mode: mode as GraphqlDocMode,
            })
            .then(notificationId => {
              const doc = inlineEditor.yText.doc;
              if (!doc) return;
              const absolutePosition =
                createAbsolutePositionFromRelativePosition(
                  relativePosition,
                  doc
                );
              if (!absolutePosition) return;
              const index = absolutePosition.index;

              const delta = inlineEditor.getDeltaByRangeIndex(index);
              if (
                !delta ||
                delta.insert !== ' ' ||
                !delta.attributes?.mention ||
                delta.attributes.mention.notification ||
                delta.attributes.mention.member !== id
              )
                return;

              inlineEditor.formatText(
                {
                  index: index - 1,
                  length: 1,
                },
                {
                  mention: {
                    member: id,
                    notification: notificationId,
                  },
                }
              );
            })
            .catch(error => {
              const err = UserFriendlyError.fromAny(error);

              if (err.is(ErrorNames.MENTION_USER_DOC_ACCESS_DENIED)) {
                track.doc.editor.atMenu.noAccessPrompted();

                const canUserManage = this.guardService.can$(
                  'Doc_Users_Manage',
                  docId
                ).signal.value;
                if (canUserManage) {
                  const username = name ?? 'Unknown';
                  notify.error({
                    title: I18n.t('com.affine.editor.at-menu.access-needed'),
                    message: I18n[
                      'com.affine.editor.at-menu.access-needed-message'
                    ]({
                      username,
                    }),
                    actions: [
                      {
                        key: 'invite',
                        label: 'Invite',
                        onClick: async () => {
                          track.$.sharePanel.$.inviteUserDocRole({
                            control: 'member list',
                            role: 'reader',
                          });

                          try {
                            await this.docGrantedUsersService.updateUserRole(
                              id,
                              DocRole.Reader
                            );

                            await notificationService.mentionUser(
                              id,
                              workspaceId,
                              {
                                id: docId,
                                title:
                                  this.docDisplayMetaService.title$(docId)
                                    .value,
                                blockId: block.blockId,
                                mode: mode as GraphqlDocMode,
                              }
                            );

                            notify.success({
                              title: I18n.t(
                                'com.affine.editor.at-menu.invited-and-notified'
                              ),
                            });
                          } catch (error) {
                            const err = UserFriendlyError.fromAny(error);
                            notify.error({
                              title: I18n[`error.${err.name}`](err.data),
                            });
                          }
                        },
                      },
                    ],
                  });
                } else {
                  notify.error({
                    title: I18n.t(
                      'com.affine.editor.at-menu.member-not-notified'
                    ),
                    message:
                      I18n[
                        'com.affine.editor.at-menu.member-not-notified-message'
                      ](),
                  });
                }

                return;
              }

              notify.error({
                title: I18n[`error.${err.name}`](err.data),
              });
            });
        },
      };
    };

    const inviteItem: LinkedMenuItem = {
      key: 'invite',
      name: 'Invite...',
      icon: UserIcon(),
      action: () => {
        close();

        track.doc.editor.atMenu.mentionMember({
          type: 'invite',
        });

        this.dialogService.open('setting', {
          activeTab: 'workspace:members',
        });
      },
    };

    const items = computed<LinkedMenuItem[]>(() => {
      const members = this.memberSearchService.result$.signal.value;
      const currentUser =
        this.workspaceServerService.server?.scope.get(AuthService).session
          .account$.signal.value;
      const canUserManage = this.guardService.can$('Workspace_Users_Manage')
        .signal.value;

      if (query.length === 0) {
        return [
          ...(currentUser
            ? [
                getMenuItem(
                  currentUser.id,
                  currentUser.info?.name,
                  currentUser.info?.avatarUrl,
                  false
                ),
              ]
            : []),
          ...members
            .slice(0, 2)
            .filter(member => member.id !== currentUser?.id)
            .map(member =>
              getMenuItem(member.id, member.name, member.avatarUrl)
            ),
          ...(canUserManage ? [inviteItem] : []),
        ];
      }

      // Create a single Fuse instance for all members
      const fuse = new Fuse(members, {
        keys: ['name'],
        includeMatches: true,
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.0,
      });
      const searchResults = fuse.search(query);

      return [
        ...searchResults.map(result => {
          const member = result.item;
          const displayName = this.highlightFuseTitle(
            result.matches,
            member.name ?? 'Unknown',
            'name'
          );
          return {
            ...getMenuItem(
              member.id,
              member.name,
              member.avatarUrl,
              member.id !== currentUser?.id
            ),
            name: html`${unsafeHTML(displayName)}`,
          };
        }),
        ...(canUserManage ? [inviteItem] : []),
      ];
    });
    const hidden = computed(() => {
      const members = this.memberSearchService.result$.signal.value;
      const loading = this.memberSearchService.isLoading$.signal.value;
      return query.length > 0 && !loading && members.length === 0;
    });

    if (query.length > 0) {
      this.memberSearchService.search(query);
    }

    return {
      name: I18n.t('com.affine.editor.at-menu.mention-members'),
      items,
      loading: this.memberSearchService.isLoading$.signal,
      hidden,
      maxDisplay: 3,
      overflowText: computed(() => {
        const totalCount = this.memberSearchService.result$.signal.value.length;
        const remainingCount = totalCount - 3;
        return I18n.t('com.affine.editor.at-menu.more-members-hint', {
          count: remainingCount,
        });
      }),
    };
  }

  private getMenusFn(): LinkedWidgetConfig['getMenus'] {
    return (query, close, editorHost, inlineEditor, abortSignal) => {
      return [
        this.linkToDocGroup(query, close, inlineEditor, abortSignal),
        this.memberGroup(query, close, inlineEditor, abortSignal),
        this.journalGroup(query, close, inlineEditor),
        this.newDocMenuGroup(query, close, editorHost, inlineEditor),
      ];
    };
  }

  private getMobileConfig(): Partial<LinkedWidgetConfig['mobile']> {
    return {
      scrollContainer: window,
      scrollTopOffset: () => {
        const header = document.querySelector('header');
        if (!header) return 0;

        const { y, height } = header.getBoundingClientRect();
        return y + height;
      },
    };
  }
}
