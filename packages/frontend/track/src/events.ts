// let '$' stands for unspecific matrix
/* eslint-disable rxjs/finnish */

// SECTION: app events
type GeneralEvents = 'openMigrationDataHelp';
type CmdkEvents = 'quickSearch' | 'recentDocs' | 'searchResultsDocs';
type AppEvents =
  | 'checkUpdates'
  | 'downloadUpdate'
  | 'downloadApp'
  | 'quitAndInstall'
  | 'openChangelog'
  | 'dismissChangelog'
  | 'contactUs'
  | 'findInPage';
type NavigationEvents =
  | 'openInNewTab'
  | 'openInSplitView'
  | 'openInPeekView'
  | 'switchTab'
  | 'switchSplitView'
  | 'tabAction'
  | 'splitViewAction'
  | 'navigate'
  | 'goBack'
  | 'goForward'
  | 'toggle' // toggle navigation panel
  | 'open'
  | 'close'; // openclose modal/diaglog

// END SECTIONalias

// SECTION: doc events
type WorkspaceEvents =
  | 'createWorkspace'
  | 'upgradeWorkspace'
  | 'enableCloudWorkspace'
  | 'import'
  | 'export'
  | 'openWorkspaceList';
type DocEvents =
  | 'openDoc'
  | 'createDoc'
  | 'quickStart'
  | 'renameDoc'
  | 'linkDoc'
  | 'deleteDoc'
  | 'restoreDoc'
  | 'switchPageMode'
  | 'openDocOptionsMenu'
  | 'openDocInfo'
  | 'copyBlockToLink'
  | 'loadDoc'
  | 'bookmark'
  | 'editProperty'
  | 'editPropertyMeta'
  | 'addProperty'
  | 'editDisplayMenu'
  | 'navigateAllDocsRouter'
  | 'navigatePinedCollectionRouter'
  | 'htmlBlockPreviewFailed';
type EditorEvents =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'foldEdgelessNote';
// END SECTION

// SECTION: setting events
type SettingEvents =
  | 'openSettings'
  | 'changeAppSetting'
  | 'changeEditorSetting'
  | 'recoverArchivedWorkspace'
  | 'deleteArchivedWorkspace'
  | 'deleteUnusedBlob';
// END SECTION

// SECTION: organize events
type CollectionEvents =
  | 'createCollection'
  | 'deleteCollection'
  | 'renameCollection'
  | 'addDocToCollection'
  | 'editCollection'
  | 'addPinnedCollection';
type FolderEvents =
  | 'createFolder'
  | 'renameFolder'
  | 'moveFolder'
  | 'deleteFolder';
type TagEvents = 'createTag' | 'deleteTag' | 'renameTag' | 'tagDoc';
type FavoriteEvents = 'toggleFavorite';
type OrganizeItemEvents = // doc, link, folder, collection, tag
  | 'createOrganizeItem'
  | 'renameOrganizeItem'
  | 'moveOrganizeItem'
  | 'deleteOrganizeItem'
  | 'orderOrganizeItem'
  | 'removeOrganizeItem';
type OrganizeEvents =
  | OrganizeItemEvents
  | CollectionEvents
  | FolderEvents
  | TagEvents
  | FavoriteEvents;

type DNDEvents = 'dragStart' | 'drag' | 'drop';
// END SECTION

// SECTION: cloud events
type ShareEvents =
  | 'createShareLink'
  | 'copyShareLink'
  | 'openShareMenu'
  | 'share';
type DocRoleEvents =
  | 'modifyDocDefaultRole'
  | 'modifyUserDocRole'
  | 'inviteUserDocRole';
type AuthEvents =
  | 'requestSignIn'
  | 'signIn'
  | 'signInFail'
  | 'signedIn'
  | 'signOut'
  | 'deleteAccount';
type AccountEvents = 'uploadAvatar' | 'removeAvatar' | 'updateUserName';
type PaymentEvents =
  | 'viewPlans'
  | 'bookDemo'
  | 'checkout'
  | 'subscribe'
  | 'changeSubscriptionRecurring'
  | 'confirmChangingSubscriptionRecurring'
  | 'cancelSubscription'
  | 'confirmCancelingSubscription'
  | 'resumeSubscription'
  | 'confirmResumingSubscription';
// END SECTION

// SECTION: ai
type AIEvents = 'addEmbeddingDoc';
// END SECTION

// SECTION: attachment
type AttachmentEvents =
  | 'openAttachmentInFullscreen'
  | 'openAttachmentInNewTab'
  | 'openAttachmentInPeekView'
  | 'openAttachmentInSplitView'
  | 'openPDFRendererFail';
// END SECTION

// SECTION: template
type TemplateEvents = 'openTemplateListMenu';
// END SECTION

// SECTION: notification
type NotificationEvents = 'openInbox' | 'clickNotification';
// END SECTION

// SECTION: Integration
type IntegrationEvents =
  | 'connectIntegration'
  | 'disconnectIntegration'
  | 'modifyIntegrationSettings'
  | 'startIntegrationImport'
  | 'selectIntegrationImport'
  | 'confirmIntegrationImport'
  | 'abortIntegrationImport'
  | 'completeIntegrationImport'
  | 'createCalendarDocEvent';
// END SECTION

// SECTION: journal
type MeetingEvents =
  | 'toggleRecordingBar'
  | 'startRecording'
  | 'dismissRecording'
  | 'finishRecording'
  | 'transcribeRecording'
  | 'openTranscribeNotes'
  | 'toggleMeetingFeatureFlag'
  | 'activeMenubarAppItem';
// END SECTION

// SECTION: mention
type MentionEvents = 'mentionMember' | 'noAccessPrompted';
// END SECTION

// SECTION: workspace embedding
type WorkspaceEmbeddingEvents =
  | 'toggleWorkspaceEmbedding'
  | 'addAdditionalDocs'
  | 'addIgnoredDocs';
// END SECTION

// SECTION: comment events
// Add events for comment actions
type CommentEvents =
  | 'createComment'
  | 'editComment'
  | 'deleteComment'
  | 'resolveComment';
// END SECTION

// SECTION: apply model
type ApplyModelEvents =
  | 'acceptAll'
  | 'rejectAll'
  | 'accept'
  | 'reject'
  | 'apply'
  | 'copy';
// END SECTION

type UserEvents =
  | GeneralEvents
  | AppEvents
  | NavigationEvents
  | WorkspaceEvents
  | DocEvents
  | EditorEvents
  | SettingEvents
  | CmdkEvents
  | OrganizeEvents
  | ShareEvents
  | DocRoleEvents
  | AuthEvents
  | AccountEvents
  | PaymentEvents
  | DNDEvents
  | AIEvents
  | CommentEvents
  | AttachmentEvents
  | TemplateEvents
  | NotificationEvents
  | IntegrationEvents
  | MeetingEvents
  | MentionEvents
  | WorkspaceEmbeddingEvents
  | ApplyModelEvents;

interface PageDivision {
  [page: string]: {
    [segment: string]: {
      [module: string]: UserEvents[];
    };
  };
}

interface PageEvents extends PageDivision {
  // page: {
  //   $: {}
  //   ^ if empty
  //   segment: {
  //     module: ['event1', 'event2']
  //   },
  // },
  // to: page.$.segment.module.event1()
  $: {
    $: {
      $: ['createWorkspace', 'checkout'];
      auth: [
        'requestSignIn',
        'signIn',
        'signedIn',
        'signInFail',
        'signOut',
        'deleteAccount',
      ];
    };
    sharePanel: {
      $: [
        'createShareLink',
        'copyShareLink',
        'export',
        'open',
        'modifyDocDefaultRole',
        'modifyUserDocRole',
        'inviteUserDocRole',
      ];
    };
    docInfoPanel: {
      $: ['open'];
      property: ['editProperty', 'addProperty', 'editPropertyMeta'];
      databaseProperty: ['editProperty'];
    };
    settingsPanel: {
      menu: ['openSettings'];
      workspace: [
        'viewPlans',
        'export',
        'addProperty',
        'editPropertyMeta',
        'deleteUnusedBlob',
      ];
      archivedWorkspaces: [
        'recoverArchivedWorkspace',
        'deleteArchivedWorkspace',
      ];
      profileAndBadge: ['viewPlans'];
      accountUsage: ['viewPlans'];
      accountSettings: ['uploadAvatar', 'removeAvatar', 'updateUserName'];
      plans: [
        'checkout',
        'subscribe',
        'changeSubscriptionRecurring',
        'confirmChangingSubscriptionRecurring',
        'cancelSubscription',
        'confirmCancelingSubscription',
        'resumeSubscription',
        'confirmResumingSubscription',
      ];
      billing: ['viewPlans', 'bookDemo'];
      about: ['checkUpdates', 'downloadUpdate', 'changeAppSetting'];
      integrationList: [
        'connectIntegration',
        'disconnectIntegration',
        'modifyIntegrationSettings',
        'startIntegrationImport',
        'selectIntegrationImport',
        'confirmIntegrationImport',
        'abortIntegrationImport',
        'completeIntegrationImport',
      ];
      meetings: ['toggleMeetingFeatureFlag'];
      indexerEmbedding: [
        'toggleWorkspaceEmbedding',
        'addAdditionalDocs',
        'addIgnoredDocs',
      ];
    };
    cmdk: {
      recent: ['recentDocs'];
      results: ['searchResultsDocs'];
      general: ['copyShareLink', 'goBack', 'goForward', 'findInPage'];
      creation: ['createDoc'];
      workspace: ['createWorkspace'];
      settings: ['openSettings', 'changeAppSetting'];
      navigation: ['navigate'];
      editor: [
        'toggleFavorite',
        'switchPageMode',
        'createDoc',
        'export',
        'deleteDoc',
        'restoreDoc',
      ];
      docInfo: ['open'];
      docHistory: ['open'];
      updates: ['quitAndInstall'];
      help: ['contactUs', 'openChangelog'];
    };
    navigationPanel: {
      $: ['quickSearch', 'createDoc', 'navigate', 'openSettings', 'toggle'];
      organize: [
        'createOrganizeItem',
        'renameOrganizeItem',
        'moveOrganizeItem',
        'deleteOrganizeItem',
        'orderOrganizeItem',
        'openInNewTab',
        'openInSplitView',
        'toggleFavorite',
        'drop',
      ];
      docs: ['createDoc', 'deleteDoc', 'linkDoc', 'drop', 'openDoc'];
      collections: [
        'createDoc',
        'addDocToCollection',
        'removeOrganizeItem',
        'drop',
        'editCollection',
      ];
      folders: ['createDoc', 'drop'];
      tags: ['createDoc', 'tagDoc', 'drop'];
      favorites: ['createDoc', 'drop'];
      migrationData: ['openMigrationDataHelp'];
      bottomButtons: [
        'downloadApp',
        'quitAndInstall',
        'openChangelog',
        'dismissChangelog',
      ];
      others: ['navigate'];
      importModal: ['open'];
      workspaceList: [
        'requestSignIn',
        'open',
        'createWorkspace',
        'createDoc',
        'openSettings',
      ];
      profileAndBadge: ['openSettings'];
      journal: ['navigate'];
    };
    aiOnboarding: {
      dialog: ['viewPlans'];
    };
    docHistory: {
      $: ['open', 'close', 'switchPageMode', 'viewPlans'];
    };
    importModal: {
      $: ['open', 'import', 'createDoc'];
    };
    paywall: {
      storage: ['viewPlans'];
      aiAction: ['viewPlans'];
    };
    appTabsHeader: {
      $: ['tabAction', 'dragStart'];
    };
    header: {
      $: ['dragStart'];
      actions: [
        'createDoc',
        'createWorkspace',
        'switchPageMode',
        'toggleFavorite',
        'openDocInfo',
        'renameDoc',
      ];
      docOptions: [
        'open',
        'deleteDoc',
        'renameDoc',
        'switchPageMode',
        'createDoc',
        'import',
        'toggleFavorite',
        'export',
      ];
      history: ['open'];
      pageInfo: ['open'];
      importModal: ['open'];
      snapshot: ['import', 'export'];
    };
    chatPanel: {
      chatPanelInput: ['addEmbeddingDoc'];
    };
    intelligence: {
      chatPanelInput: ['addEmbeddingDoc'];
    };
    commentPanel: {
      $: ['createComment', 'editComment', 'deleteComment', 'resolveComment'];
    };
    attachment: {
      $: [
        'openAttachmentInFullscreen',
        'openAttachmentInNewTab',
        'openAttachmentInPeekView',
        'openAttachmentInSplitView',
        'openPDFRendererFail',
      ];
    };
    sidebar: {
      newDoc: ['quickStart'];
      template: ['openTemplateListMenu', 'quickStart'];
      notifications: ['openInbox', 'clickNotification'];
    };
    splitViewIndicator: {
      $: ['splitViewAction', 'openInSplitView', 'openInPeekView'];
    };
  };
  doc: {
    $: {
      $: ['loadDoc'];
    };
    editor: {
      slashMenu: ['linkDoc', 'createDoc', 'bookmark'];
      atMenu: [
        'linkDoc',
        'import',
        'createDoc',
        'mentionMember',
        'noAccessPrompted',
      ];
      quickSearch: ['createDoc'];
      formatToolbar: ['bold'];
      pageRef: ['navigate'];
      toolbar: [
        'copyBlockToLink',
        'openInSplitView',
        'openInNewTab',
        'openInPeekView',
      ];
      aiActions: ['requestSignIn'];
      starterBar: ['quickStart', 'openTemplateListMenu'];
      audioBlock: ['transcribeRecording', 'openTranscribeNotes'];
      codeBlock: ['htmlBlockPreviewFailed'];
    };
    inlineDocInfo: {
      $: ['toggle'];
      property: ['editProperty', 'editPropertyMeta', 'addProperty'];
      databaseProperty: ['editProperty'];
    };
    sidepanel: {
      property: ['addProperty', 'editPropertyMeta'];
      journal: ['createCalendarDocEvent'];
    };
    biDirectionalLinksPanel: {
      $: ['toggle'];
      backlinkTitle: ['toggle', 'navigate'];
      backlinkPreview: ['navigate'];
    };
  };
  edgeless: {
    pageBlock: {
      headerToolbar: [
        'toggle',
        'openDocInfo',
        'copyBlockToLink',
        'switchPageMode',
      ];
    };
  };
  workspace: {
    $: {
      $: ['upgradeWorkspace'];
    };
  };
  allDocs: {
    header: {
      navigation: ['navigateAllDocsRouter', 'navigatePinedCollectionRouter'];
      actions: ['createDoc', 'createWorkspace'];
      displayMenu: ['editDisplayMenu'];
      viewMode: ['editDisplayMenu'];
      collection: ['editCollection', 'addPinnedCollection'];
    };
    list: {
      doc: ['openDoc'];
      docMenu: [
        'createDoc',
        'deleteDoc',
        'openInSplitView',
        'toggleFavorite',
        'openInNewTab',
        'openDocInfo',
      ];
    };
  };
  collection: {
    docList: {
      docMenu: ['removeOrganizeItem'];
    };
    collection: {
      $: ['editCollection'];
    };
  };
  tag: {};
  trash: {};
  subscriptionLanding: {
    $: {
      $: ['checkout'];
    };
  };
  menubarApp: {
    menubarActionsMenu: {
      menubarActionsList: ['activeMenubarAppItem', 'startRecording'];
    };
  };
  popup: {
    $: {
      recordingBar: [
        'toggleRecordingBar',
        'startRecording',
        'dismissRecording',
        'finishRecording',
      ];
    };
  };
  clipper: {
    $: {
      $: ['createDoc'];
    };
  };
  applyModel: {
    widget: {
      page: ['acceptAll', 'rejectAll'];
      block: ['accept', 'reject'];
    };
    chat: {
      $: ['apply', 'accept', 'reject', 'copy'];
    };
  };
}

type OrganizeItemType = 'doc' | 'folder' | 'collection' | 'tag' | 'favorite';
type OrganizeItemArgs =
  | {
      type: 'link';
      target: OrganizeItemType;
    }
  | {
      type: OrganizeItemType;
    };

type PaymentEventArgs = {
  plan: string;
  recurring: string;
};

type AttachmentEventArgs = {
  type: string; // file type
};

type TabActionControlType =
  | 'click'
  | 'dnd'
  | 'midClick'
  | 'xButton'
  | 'contextMenu';
type TabActionType =
  | 'pin'
  | 'unpin'
  | 'close'
  | 'refresh'
  | 'moveTab'
  | 'openInSplitView'
  | 'openInNewTab'
  | 'switchSplitView'
  | 'switchTab'
  | 'separateTabs';

type SplitViewActionControlType = 'menu' | 'indicator';
type SplitViewActionType = 'open' | 'close' | 'move' | 'closeOthers';

type AuthArgs = {
  method: 'password' | 'magic-link' | 'oauth' | 'otp';
  provider?: string;
};

type ImportStatus = 'importing' | 'failed' | 'success';
type ImportArgs = {
  type: string;
  status?: ImportStatus;
  error?: string;
  result?: {
    docCount: number;
  };
};
type IntegrationArgs<T extends Record<string, any>> = {
  type: string;
  control:
    | 'Readwise Card'
    | 'Readwise settings'
    | 'Readwise import list'
    | 'Calendar Setting';
} & T;

type RecordingEventArgs = {
  type: 'Meeting record';
  method?: string;
  option?: 'Auto transcribing' | 'handle transcribing' | 'on' | 'off';
};

type ApplyModelArgs = {
  /*  ​​User's complete instruction */
  instruction?: string;
  /* Split individual semantic change requests */
  operation?: string;
};

export type EventArgs = {
  createWorkspace: { flavour: string };
  signIn: AuthArgs;
  signedIn: AuthArgs;
  signInFail: AuthArgs & { reason: string };
  viewPlans: PaymentEventArgs;
  checkout: PaymentEventArgs;
  subscribe: PaymentEventArgs;
  cancelSubscription: PaymentEventArgs;
  confirmCancelingSubscription: PaymentEventArgs;
  resumeSubscription: PaymentEventArgs;
  confirmResumingSubscription: PaymentEventArgs;
  changeSubscriptionRecurring: PaymentEventArgs;
  confirmChangingSubscriptionRecurring: PaymentEventArgs;
  navigate: { to: string };
  openSettings: { to: string };
  changeAppSetting: { key: string; value: string | boolean | number };
  changeEditorSetting: { key: string; value: string | boolean | number };
  createOrganizeItem: OrganizeItemArgs;
  renameOrganizeItem: OrganizeItemArgs;
  moveOrganizeItem: OrganizeItemArgs;
  removeOrganizeItem: OrganizeItemArgs;
  deleteOrganizeItem: OrganizeItemArgs;
  orderOrganizeItem: OrganizeItemArgs;
  openInNewTab: { type: OrganizeItemType };
  openInSplitView: { type: OrganizeItemType; route?: string };
  tabAction: {
    type?: OrganizeItemType;
    control: TabActionControlType;
    action: TabActionType;
  };
  splitViewAction: {
    control: SplitViewActionControlType;
    action: SplitViewActionType;
  };
  toggleFavorite: OrganizeItemArgs & { on: boolean };
  toggle: { type: 'collapse' | 'expand' };
  createDoc: { mode?: 'edgeless' | 'page' };
  quickStart: { with: 'page' | 'edgeless' | 'template' | 'ai' };
  switchPageMode: { mode: 'edgeless' | 'page' };
  createShareLink: { mode: 'edgeless' | 'page' };
  copyShareLink: {
    type: 'default' | 'doc' | 'whiteboard' | 'block' | 'element';
  };
  import: ImportArgs;
  export: { type: string };
  copyBlockToLink: {
    type: string;
  };
  editProperty: { type: string };
  editPropertyMeta: { type: string; field: string };
  addProperty: { type: string; control: 'at menu' | 'property list' };
  linkDoc: { type: string; journal: boolean };
  drop: { type: string };
  dragStart: { type: string };
  addEmbeddingDoc: {
    type?: 'page' | 'edgeless';
    control: 'addButton' | 'atMenu';
    method: 'doc' | 'cur-doc' | 'file' | 'tags' | 'collections' | 'suggestion';
  };
  openAttachmentInFullscreen: AttachmentEventArgs;
  openAttachmentInNewTab: AttachmentEventArgs;
  openAttachmentInPeekView: AttachmentEventArgs;
  openAttachmentInSplitView: AttachmentEventArgs;
  modifyUserDocRole: { role: string };
  modifyDocDefaultRole: { role: string };
  inviteUserDocRole: {
    control: 'member list';
    role: string;
  };
  openInbox: { unreadCount: number };
  clickNotification: {
    type: string;
    item: 'read' | 'button' | 'dismiss';
    button?: string;
  };
  connectIntegration: IntegrationArgs<{ result: 'success' | 'failed' }>;
  disconnectIntegration: IntegrationArgs<{ method: 'keep' | 'delete' }>;
  modifyIntegrationSettings: IntegrationArgs<{
    item: string;
    option: any;
    method: any;
  }>;
  startIntegrationImport: IntegrationArgs<{
    method: 'new' | 'withtimestamp' | 'cleartimestamp';
  }>;
  selectIntegrationImport: IntegrationArgs<{
    method: 'single' | 'all';
    option: 'on' | 'off';
  }>;
  confirmIntegrationImport: IntegrationArgs<{
    method: 'new' | 'withtimestamp';
  }>;
  abortIntegrationImport: IntegrationArgs<{
    time: number;
    done: number;
    total: number;
  }>;
  completeIntegrationImport: IntegrationArgs<{
    time: number;
    done: number;
    total: number;
  }>;
  toggleRecordingBar: RecordingEventArgs & {
    method: string;
    appName: string;
  };
  startRecording: RecordingEventArgs & {
    method: string;
    appName: string;
  };
  dismissRecording: RecordingEventArgs & {
    method: string;
    appName: string;
  };
  finishRecording: RecordingEventArgs & {
    method: 'fail' | 'success';
    appName: string;
  };
  transcribeRecording: RecordingEventArgs & {
    method: 'fail' | 'success';
    option: 'Auto transcribing' | 'handle transcribing';
  };
  openTranscribeNotes: RecordingEventArgs & {
    method: 'success' | 'reach limit' | 'not signed in' | 'not owner';
    option: 'on' | 'off';
  };
  toggleMeetingFeatureFlag: RecordingEventArgs & {
    option: 'on' | 'off';
  };
  activeMenubarAppItem: RecordingEventArgs & {
    control:
      | 'Open Journal'
      | 'New Page'
      | 'New Edgeless'
      | 'Start recording meeting'
      | 'Stop recording'
      | 'Open AFFiNE'
      | 'About AFFiNE'
      | 'Meeting Settings'
      | 'Quit AFFiNE Completely';
  };
  mentionMember: {
    type: 'member' | 'invite' | 'more';
  };
  htmlBlockPreviewFailed: {
    type: string;
  };
  noAccessPrompted: {};
  loadDoc: {
    workspaceId: string;
    docId: string;
    time: number;
    success: boolean;
  };
  toggleWorkspaceEmbedding: {
    type: 'Embedding';
    control: 'Workspace embedding';
    option: 'on' | 'off';
  };
  addAdditionalDocs: {
    type: 'Embedding';
    control: 'Select doc';
    docType: string;
  };
  addIgnoredDocs: {
    type: 'Embedding';
    control: 'Additional docs';
    result: 'success' | 'failure';
  };
  editDisplayMenu: {
    control:
      | 'groupBy'
      | 'orderBy'
      | 'displayProperties'
      | 'listViewOptions'
      | 'quickActions';
    type: string;
  };
  navigateAllDocsRouter: {
    control: string;
  };
  navigatePinedCollectionRouter: {
    control: 'all' | 'user-custom-collection';
  };
  resolveComment: { type: 'on' | 'off' };
  createComment: {
    type: 'root' | 'node';
    withAttachment: boolean;
    withMention: boolean;
    category: string;
  };
  editComment: { type: 'root' | 'node' };
  deleteComment: { type: 'root' | 'node' };
  accept: ApplyModelArgs;
  reject: ApplyModelArgs;
  apply: ApplyModelArgs;
};

// for type checking
// if it complains, check the definition of [EventArgs] to make sure it's key is a subset of [UserEvents]
export const YOU_MUST_DEFINE_ARGS_WITH_WRONG_EVENT_NAME: keyof EventArgs extends UserEvents
  ? true
  : false = true;

export type Events = PageEvents;
