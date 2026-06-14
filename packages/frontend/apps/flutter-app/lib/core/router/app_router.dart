import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/pages/sign_in_page.dart';
import '../../features/auth/presentation/pages/sign_up_page.dart';
import '../../features/auth/presentation/pages/magic_link_page.dart';
import '../../features/auth/presentation/pages/oauth_callback_page.dart';
import '../../features/workspace/presentation/pages/workspace_list_page.dart';
import '../../features/workspace/presentation/pages/workspace_home_page.dart';
import '../../features/document/presentation/pages/all_docs_page.dart';
import '../../features/document/presentation/pages/document_detail_page.dart';
import '../../features/collection/presentation/pages/collections_list_page.dart';
import '../../features/collection/presentation/pages/collection_detail_page.dart';
import '../../features/tag/presentation/pages/tags_list_page.dart';
import '../../features/tag/presentation/pages/tag_detail_page.dart';
import '../../features/journal/presentation/pages/journals_page.dart';
import '../../features/search/presentation/pages/search_page.dart';
import '../../shared/widgets/navigation/workspace_shell.dart';
import 'route_names.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authNotifierProvider);

  return GoRouter(
    initialLocation: RouteNames.workspaceList,
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final isAuthenticated = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation.startsWith('/sign-in') ||
          state.matchedLocation.startsWith('/sign-up') ||
          state.matchedLocation.startsWith('/magic-link') ||
          state.matchedLocation.startsWith('/oauth');

      if (!isAuthenticated && !isAuthRoute) return RouteNames.signIn;
      if (isAuthenticated && isAuthRoute) return RouteNames.workspaceList;
      return null;
    },
    routes: [
      GoRoute(
        path: RouteNames.signIn,
        name: 'signIn',
        builder: (context, state) => const SignInPage(),
      ),
      GoRoute(
        path: RouteNames.signUp,
        name: 'signUp',
        builder: (context, state) => const SignUpPage(),
      ),
      GoRoute(
        path: RouteNames.magicLink,
        name: 'magicLink',
        builder: (context, state) => const MagicLinkPage(),
      ),
      GoRoute(
        path: RouteNames.oauthCallback,
        name: 'oauthCallback',
        builder: (context, state) => const OAuthCallbackPage(),
      ),
      GoRoute(
        path: RouteNames.workspaceList,
        name: 'workspaceList',
        builder: (context, state) => const WorkspaceListPage(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          final wsId = state.pathParameters['workspaceId'] ?? '';
          return WorkspaceShell(workspaceId: wsId, child: child);
        },
        routes: [
          GoRoute(
            path: '/workspace/:workspaceId/home',
            name: 'workspaceHome',
            builder: (context, state) => WorkspaceHomePage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/all',
            name: 'workspaceAllDocs',
            builder: (context, state) => AllDocsPage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/search',
            name: 'workspaceSearch',
            builder: (context, state) => SearchPage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/journals',
            name: 'workspaceJournals',
            builder: (context, state) => JournalsPage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/collections',
            name: 'workspaceCollections',
            builder: (context, state) => CollectionsListPage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/collection/:collectionId',
            name: 'collectionDetail',
            builder: (context, state) => CollectionDetailPage(
              workspaceId: state.pathParameters['workspaceId']!,
              collectionId: state.pathParameters['collectionId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/tags',
            name: 'workspaceTags',
            builder: (context, state) => TagsListPage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/tag/:tagId',
            name: 'tagDetail',
            builder: (context, state) => TagDetailPage(
              workspaceId: state.pathParameters['workspaceId']!,
              tagId: state.pathParameters['tagId']!,
            ),
          ),
          GoRoute(
            path: '/workspace/:workspaceId/doc/:pageId',
            name: 'documentDetail',
            builder: (context, state) => DocumentDetailPage(
              workspaceId: state.pathParameters['workspaceId']!,
              documentId: state.pathParameters['pageId']!,
            ),
          ),
        ],
      ),
    ],
  );
});
