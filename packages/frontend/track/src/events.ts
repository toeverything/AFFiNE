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
  | 'switchTab'
  | 'switchSplitView'
  | 'tabAction'
  | 'navigate'
  | 'goBack'
  | 'goForward'
  | 'toggle' // toggle navigation panel
  | 'open'
  | 'close'; // openclose modal/diaglog

// END SECTION

// SECTION: doc events
type WorkspaceEvents =
  | 'createWorkspace'
  | 'upgradeWorkspace'
  | 'enableCloudWorkspace'
  | 'import'
  | 'export'
  | 'openWorkspaceList';
type DocEvents =
  | 'createDoc'
  | 'renameDoc'
  | 'linkDoc'
  | 'deleteDoc'
  | 'restoreDoc'
  | 'switchPageMode'
  | 'openDocOptionsMenu'
  | 'openDocInfo'
  | 'copyBlockToLink'
  | 'bookmark';
type EditorEvents = 'bold' | 'italic' | 'underline' | 'strikeThrough';
// END SECTION

// SECTION: setting events
type SettingEvents =
  | 'openSettings'
  | 'changeAppSetting'
  | 'changeEditorSetting';
// END SECTION

// SECTION: organize events
type CollectionEvents =
  | 'createCollection'
  | 'deleteCollection'
  | 'renameCollection'
  | 'addDocToCollection';
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
// END SECTION

// SECTION: cloud events
type ShareEvents =
  | 'createShareLink'
  | 'copyShareLink'
  | 'openShareMenu'
  | 'share';
type AuthEvents = 'signIn' | 'signInFail' | 'signedIn' | 'signOut';
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

// SECTION: copilot events
type CopilotEvents =
  | 'startChat'
  | 'resetChat'
  | 'abortChat'
  | 'addChatAttachment'
  | 'invokeAction'
  | 'discardAction'
  | 'acceptAction';
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
  | AuthEvents
  | AccountEvents
  | PaymentEvents
  | CopilotEvents;

interface PageDivision {
  [page: string]: {
    [segment: string]: {
      [module: string]: UserEvents[];
    };
  };
}

const PageEvents = {
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
      $: ['createWorkspace', 'checkout'],
      auth: ['signIn', 'signedIn', 'signInFail', 'signOut'],
    },
    sharePanel: {
      $: ['createShareLink', 'copyShareLink', 'export', 'open'],
    },
    docInfoPanel: {
      $: ['open'],
    },
    settingsPanel: {
      menu: ['openSettings'],
      workspace: ['viewPlans'],
      profileAndBadge: ['viewPlans'],
      accountUsage: ['viewPlans'],
      accountSettings: ['uploadAvatar', 'removeAvatar', 'updateUserName'],
      plans: [
        'checkout',
        'subscribe',
        'changeSubscriptionRecurring',
        'confirmChangingSubscriptionRecurring',
        'cancelSubscription',
        'confirmCancelingSubscription',
        'resumeSubscription',
        'confirmResumingSubscription',
      ],
      billing: ['viewPlans', 'bookDemo'],
      about: ['checkUpdates', 'downloadUpdate', 'changeAppSetting'],
    },
    cmdk: {
      recent: ['recentDocs'],
      results: ['searchResultsDocs'],
      general: ['copyShareLink', 'goBack', 'goForward', 'findInPage'],
      creation: ['createDoc'],
      workspace: ['createWorkspace'],
      settings: ['openSettings', 'changeAppSetting'],
      navigation: ['navigate'],
      editor: [
        'toggleFavorite',
        'switchPageMode',
        'createDoc',
        'export',
        'deleteDoc',
        'restoreDoc',
      ],
      docInfo: ['open'],
      docHistory: ['open'],
      updates: ['quitAndInstall'],
      help: ['contactUs', 'openChangelog'],
    },
    navigationPanel: {
      $: ['quickSearch', 'createDoc', 'navigate', 'openSettings', 'toggle'],
      organize: [
        'createOrganizeItem',
        'renameOrganizeItem',
        'moveOrganizeItem',
        'deleteOrganizeItem',
        'orderOrganizeItem',
        'openInNewTab',
        'openInSplitView',
        'toggleFavorite',
      ],
      docs: ['createDoc', 'deleteDoc', 'linkDoc'],
      collections: ['createDoc', 'addDocToCollection', 'removeOrganizeItem'],
      folders: ['createDoc'],
      tags: ['createDoc', 'tagDoc'],
      favorites: ['createDoc'],
      migrationData: ['openMigrationDataHelp'],
      bottomButtons: [
        'downloadApp',
        'quitAndInstall',
        'openChangelog',
        'dismissChangelog',
      ],
      others: ['navigate', 'import'],
      workspaceList: [
        'open',
        'signIn',
        'createWorkspace',
        'createDoc',
        'openSettings',
      ],
      profileAndBadge: ['openSettings'],
      journal: ['navigate'],
    },
    aiOnboarding: {
      dialog: ['viewPlans'],
    },
    docHistory: {
      $: ['open', 'close', 'switchPageMode', 'viewPlans'],
    },
    paywall: {
      storage: ['viewPlans'],
      aiAction: ['viewPlans'],
    },
    appTabsHeader: {
      $: ['tabAction'],
    },
    header: {
      actions: [
        'createDoc',
        'createWorkspace',
        'switchPageMode',
        'toggleFavorite',
        'openDocInfo',
        'renameDoc',
      ],
      docOptions: [
        'open',
        'deleteDoc',
        'renameDoc',
        'switchPageMode',
        'createDoc',
        'import',
        'toggleFavorite',
        'export',
      ],
      history: ['open'],
      pageInfo: ['open'],
    },
  },
  doc: {
    editor: {
      slashMenu: ['linkDoc', 'createDoc', 'bookmark'],
      atMenu: ['linkDoc'],
      quickSearch: ['createDoc'],
      formatToolbar: ['bold'],
      pageRef: ['navigate'],
      toolbar: ['copyBlockToLink'],
    },
    inlineDocInfo: {
      $: ['toggle'],
    },
  },
  copilot: {
    chat: {
      $: ['startChat', 'abortChat', 'resetChat', 'addChatAttachment'],
    },
    page: {
      action_panel: ['invokeAction', 'discardAction', 'acceptAction'],
      inline_panel: ['invokeAction', 'discardAction', 'acceptAction'],
      chat: ['invokeAction', 'discardAction', 'acceptAction'],
    },
    edgeless: {
      action_panel: ['invokeAction', 'discardAction', 'acceptAction'],
      inline_panel: ['invokeAction', 'discardAction', 'acceptAction'],
      chat: ['invokeAction', 'discardAction', 'acceptAction'],
    },
  },
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  edgeless: {},
  workspace: {
    $: {
      $: ['upgradeWorkspace'],
    },
  },
  allDocs: {
    header: {
      actions: ['createDoc', 'createWorkspace'],
    },
    list: {
      docMenu: [
        'createDoc',
        'deleteDoc',
        'openInSplitView',
        'toggleFavorite',
        'openInNewTab',
      ],
    },
  },
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  collection: {
    docList: {
      docMenu: ['removeOrganizeItem'],
    },
  },
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  tag: {},
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  trash: {},
  subscriptionLanding: {
    $: {
      $: ['checkout'],
    },
  },
} as const satisfies PageDivision;

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

type AuthArgs = {
  method: 'password' | 'magic-link' | 'oauth';
  provider?: string;
};

export type EventArgs = {
  createWorkspace: { flavour: string };
  signIn: AuthArgs;
  signedIn: AuthArgs;
  signInFail: AuthArgs;
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
  openInSplitView: { type: OrganizeItemType };
  tabAction: {
    type?: OrganizeItemType;
    control: TabActionControlType;
    action: TabActionType;
  };
  toggleFavorite: OrganizeItemArgs & { on: boolean };
  createDoc: { mode?: 'edgeless' | 'page' };
  switchPageMode: { mode: 'edgeless' | 'page' };
  createShareLink: { mode: 'edgeless' | 'page' };
  copyShareLink: {
    type: 'default' | 'doc' | 'whiteboard' | 'block' | 'element';
  };
  export: { type: string };
  copyBlockToLink: {
    type: string;
  };
  // copilot
  invokeAction: {
    action: string;
    retry?: boolean;
  };
  discardAction: {
    action: string;
    control:
      | 'stop_button'
      | 'discard_button'
      | 'paywall'
      | 'backend_policy'
      | 'backend_error'
      | 'login_required'
      | 'retry';
  };
  acceptAction: {
    action: string;
    control:
      | 'insert'
      | 'insert_note'
      | 'replace'
      | 'as_caption'
      | 'continue_in_chat';
  };
};

// for type checking
// if it complains, check the definition of [EventArgs] to make sure it's key is a subset of [UserEvents]
export const YOU_MUST_DEFINE_ARGS_WITH_WRONG_EVENT_NAME: keyof EventArgs extends UserEvents
  ? true
  : false = true;

export type Events = typeof PageEvents;
