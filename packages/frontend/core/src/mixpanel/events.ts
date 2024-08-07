// let '$' stands for unspecific matrix
/* eslint-disable rxjs/finnish */

// SECTION: app events
type GeneralEvents = 'openMigrationDataHelp' | 'export';
type CmdkEvents = 'quickSearch';
type AppEvents =
  | 'checkUpdates'
  | 'downloadUpdate'
  | 'downloadApp'
  | 'quitAndInstall'
  | 'openChangelog'
  | 'dismissChangelog';
type NavigationEvents =
  | 'openInNewTab'
  | 'openInSplitView'
  | 'switchTab'
  | 'switchSplitView'
  | 'navigate'
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
  | 'switchPageMode'
  | 'openDocOptionsMenu'
  | 'openDocInfo'
  | 'renameDoc'
  | 'deleteDoc'
  | 'viewHistoryVersions'
  | 'viewInfo';
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
    | 'orderOrganizeItem';
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
type AuthEvents = 'signIn' | 'signUp' | 'oauth' | 'signOut';
type AccountEvents = 'uploadAvatar' | 'removeAvatar' | 'updateUserName';
type PaymentEvents =
  | 'viewPlans'
  | 'bookDemo'
  | 'checkout'
  | 'changeSubscriptionRecurring'
  | 'confirmChangingSubscriptionRecurring'
  | 'cancelSubscription'
  | 'confirmCancelingSubscription'
  | 'resumeSubscription'
  | 'confirmResumingSubscription';
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
  | PaymentEvents;

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
      auth: ['oauth', 'signIn', 'signUp'],
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
      $: ['createDoc'],
      settings: ['openSettings', 'changeAppSetting'],
    },
    navigationPanel: {
      $: ['quickSearch', 'createDoc', 'navigate', 'openSettings'],
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
      collections: ['createDoc', 'addDocToCollection'],
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
      slashMenu: ['linkDoc', 'createDoc'],
      atMenu: ['linkDoc'],
      formatToolbar: ['bold'],
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
      docMenu: ['createDoc'],
    },
  },
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  collection: {},
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

export type EventArgs = {
  createWorkspace: { flavour: string };
  oauth: { provider: string };
  viewPlans: PaymentEventArgs;
  checkout: PaymentEventArgs;
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
  deleteOrganizeItem: OrganizeItemArgs;
  orderOrganizeItem: OrganizeItemArgs;
  openInNewTab: { type: OrganizeItemType };
  openInSplitView: { type: OrganizeItemType };
  toggleFavorite: OrganizeItemArgs & { on: boolean };
  createDoc: { mode?: 'edgeless' | 'page' };
  switchPageMode: { mode: 'edgeless' | 'page' };
  createShareLink: { mode: 'edgeless' | 'page' };
  copyShareLink: { type: 'public' | 'private' };
  export: { type: string };
};

// for type checking
// if it complains, check the definition of [EventArgs] to make sure it's key is a subset of [UserEvents]
export const YOU_MUST_DEFINE_ARGS_WITH_WRONG_EVENT_NAME: keyof EventArgs extends UserEvents
  ? true
  : false = true;

export type Events = typeof PageEvents;
