class RouteNames {
  RouteNames._();

  static const String signIn = '/sign-in';
  static const String signUp = '/sign-up';
  static const String magicLink = '/magic-link';
  static const String oauthCallback = '/oauth/callback';
  static const String workspaceList = '/';
  static const String workspaceShell = '/workspace/:workspaceId';
  static const String workspaceHome = '/workspace/:workspaceId/home';
  static const String workspaceAllDocs = '/workspace/:workspaceId/all';
  static const String workspaceCollections = '/workspace/:workspaceId/collections';
  static const String workspaceTags = '/workspace/:workspaceId/tags';
  static const String workspaceJournals = '/workspace/:workspaceId/journals';
  static const String workspaceSearch = '/workspace/:workspaceId/search';
  static const String documentDetail = '/workspace/:workspaceId/doc/:pageId';
  static const String collectionDetail = '/workspace/:workspaceId/collection/:collectionId';
  static const String tagDetail = '/workspace/:workspaceId/tag/:tagId';
  static const String settings = '/settings';
  static const String settingsAppearance = '/settings/appearance';
  static const String settingsProfile = '/settings/profile';
  static const String settingsSubscription = '/settings/subscription';
  static const String aiChat = '/ai/:workspaceId';
}
