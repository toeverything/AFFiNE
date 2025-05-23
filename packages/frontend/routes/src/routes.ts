// #region Path Parameter Types
export interface RouteParamsTypes {
  workspace: {
    index: { workspaceId: string };
    all: { workspaceId: string };
    trash: { workspaceId: string };
    doc: {
      index: { workspaceId: string; docId: string };
      attachment: { workspaceId: string; docId: string; attachmentId: string };
    };
    journals: { workspaceId: string };
    collections: {
      index: { workspaceId: string };
      collection: { workspaceId: string; collectionId: string };
    };
    tags: {
      index: { workspaceId: string };
      tag: { workspaceId: string; tagId: string };
    };
    settings: { workspaceId: string };
  };
  share: { workspaceId: string; pageId: string };
  invite: { inviteId: string };
  payment: { plan: string };
  auth: { authType: string };
  openApp: { action: string };
  admin: { settings: { module: { module: string } } };
}
// #endregion

// #region Absolute Paths
export const ROUTES = {
  index: '/',
  workspace: {
    index: '/workspaces/:workspaceId',
    all: '/workspaces/:workspaceId/all',
    trash: '/workspaces/:workspaceId/trash',
    doc: {
      index: '/workspaces/:workspaceId/docs/:docId',
      attachment:
        '/workspaces/:workspaceId/docs/:docId/attachment/:attachmentId',
    },
    journals: '/workspaces/:workspaceId/journals',
    collections: {
      index: '/workspaces/:workspaceId/collections',
      collection: '/workspaces/:workspaceId/collections/:collectionId',
    },
    tags: {
      index: '/workspaces/:workspaceId/tags',
      tag: '/workspaces/:workspaceId/tags/:tagId',
    },
    settings: '/workspaces/:workspaceId/settings',
  },
  share: '/share/:workspaceId/:pageId',
  expired: '/expired',
  invite: '/invite/:inviteId',
  payment: '/payment/:plan/success',
  onboarding: '/onboarding',
  redirect: '/redirect',
  subscribe: '/subscribe',
  upgradeToTeam: '/upgrade-to-team',
  upgradeSuccess: {
    index: '/upgrade-success',
    team: '/upgrade-success/team',
    selfHostTeam: '/upgrade-success/self-host-team',
  },
  aiUpgradeSuccess: '/ai-upgrade-success',
  tryCloud: '/try-cloud',
  themeEditor: '/theme-editor',
  template: {
    index: '/template',
    import: '/template/import',
    preview: '/template/preview',
  },
  auth: '/auth/:authType',
  signIn: '/sign-in',
  magicLink: '/magic-link',
  oauth: {
    index: '/oauth',
    login: '/oauth/login',
    callback: '/oauth/callback',
  },
  openApp: '/open-app/:action',
  notFound: '/404',
  admin: {
    index: '/admin',
    auth: '/admin/auth',
    setup: '/admin/setup',
    accounts: '/admin/accounts',
    ai: '/admin/ai',
    settings: { index: '/admin/settings', module: '/admin/settings/:module' },
    about: '/admin/about',
    notFound: '/admin/404',
  },
};
// #endregion

// #region Relative Paths
export const RELATIVE_ROUTES = {
  index: '/',
  workspace: {
    index: 'workspaces/:workspaceId',
    all: 'all',
    trash: 'trash',
    doc: { index: 'docs/:docId', attachment: 'attachment/:attachmentId' },
    journals: 'journals',
    collections: { index: 'collections', collection: ':collectionId' },
    tags: { index: 'tags', tag: ':tagId' },
    settings: 'settings',
  },
  share: 'share/:workspaceId/:pageId',
  expired: 'expired',
  invite: 'invite/:inviteId',
  payment: 'payment/:plan/success',
  onboarding: 'onboarding',
  redirect: 'redirect',
  subscribe: 'subscribe',
  upgradeToTeam: 'upgrade-to-team',
  upgradeSuccess: {
    index: 'upgrade-success',
    team: 'team',
    selfHostTeam: 'self-host-team',
  },
  aiUpgradeSuccess: 'ai-upgrade-success',
  tryCloud: 'try-cloud',
  themeEditor: 'theme-editor',
  template: { index: 'template', import: 'import', preview: 'preview' },
  auth: 'auth/:authType',
  signIn: 'sign-in',
  magicLink: 'magic-link',
  oauth: { index: 'oauth', login: 'login', callback: 'callback' },
  openApp: 'open-app/:action',
  notFound: '404',
  admin: {
    index: 'admin',
    auth: 'auth',
    setup: 'setup',
    accounts: 'accounts',
    ai: 'ai',
    settings: { index: 'settings', module: ':module' },
    about: 'about',
    notFound: '404',
  },
};
// #endregion

// #region Path Factories
const home = () => '/';
const workspace = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}`;
workspace.all = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/all`;
workspace.trash = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/trash`;
const workspace_doc = (params: { workspaceId: string; docId: string }) =>
  `/workspaces/${params.workspaceId}/docs/${params.docId}`;
workspace_doc.attachment = (params: {
  workspaceId: string;
  docId: string;
  attachmentId: string;
}) =>
  `/workspaces/${params.workspaceId}/docs/${params.docId}/attachment/${params.attachmentId}`;
workspace.doc = workspace_doc;
workspace.journals = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/journals`;
const workspace_collections = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/collections`;
workspace_collections.collection = (params: {
  workspaceId: string;
  collectionId: string;
}) => `/workspaces/${params.workspaceId}/collections/${params.collectionId}`;
workspace.collections = workspace_collections;
const workspace_tags = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/tags`;
workspace_tags.tag = (params: { workspaceId: string; tagId: string }) =>
  `/workspaces/${params.workspaceId}/tags/${params.tagId}`;
workspace.tags = workspace_tags;
workspace.settings = (params: { workspaceId: string }) =>
  `/workspaces/${params.workspaceId}/settings`;
const share = (params: { workspaceId: string; pageId: string }) =>
  `/share/${params.workspaceId}/${params.pageId}`;
const expired = () => '/expired';
const invite = (params: { inviteId: string }) => `/invite/${params.inviteId}`;
const payment = (params: { plan: string }) => `/payment/${params.plan}/success`;
const onboarding = () => '/onboarding';
const redirect = () => '/redirect';
const subscribe = () => '/subscribe';
const upgradeToTeam = () => '/upgrade-to-team';
const upgradeSuccess = () => '/upgrade-success';
upgradeSuccess.team = () => '/upgrade-success/team';
upgradeSuccess.selfHostTeam = () => '/upgrade-success/self-host-team';
const aiUpgradeSuccess = () => '/ai-upgrade-success';
const tryCloud = () => '/try-cloud';
const themeEditor = () => '/theme-editor';
const template = () => '/template';
template.import = () => '/template/import';
template.preview = () => '/template/preview';
const auth = (params: { authType: string }) => `/auth/${params.authType}`;
const signIn = () => '/sign-in';
const magicLink = () => '/magic-link';
const oauth = () => '/oauth';
oauth.login = () => '/oauth/login';
oauth.callback = () => '/oauth/callback';
const openApp = (params: { action: string }) => `/open-app/${params.action}`;
const notFound = () => '/404';
const admin = () => '/admin';
admin.auth = () => '/admin/auth';
admin.setup = () => '/admin/setup';
admin.accounts = () => '/admin/accounts';
admin.ai = () => '/admin/ai';
const admin_settings = () => '/admin/settings';
admin_settings.module = (params: { module: string }) =>
  `/admin/settings/${params.module}`;
admin.settings = admin_settings;
admin.about = () => '/admin/about';
admin.notFound = () => '/admin/404';
export const FACTORIES = {
  workspace,
  share,
  expired,
  invite,
  payment,
  onboarding,
  redirect,
  subscribe,
  upgradeToTeam,
  upgradeSuccess,
  aiUpgradeSuccess,
  tryCloud,
  themeEditor,
  template,
  auth,
  signIn,
  magicLink,
  oauth,
  openApp,
  notFound,
  admin,
  home,
};
// #endregion
