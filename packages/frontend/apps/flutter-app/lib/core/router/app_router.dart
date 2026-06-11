import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/pages/sign_in_page.dart';
import '../../features/auth/presentation/pages/sign_up_page.dart';
import '../../features/auth/presentation/pages/magic_link_page.dart';
import '../../features/auth/presentation/pages/oauth_callback_page.dart';
import '../../features/workspace/presentation/pages/workspace_list_page.dart';
import '../../features/workspace/presentation/pages/workspace_home_page.dart';
import '../../shared/widgets/app_scaffold.dart';
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

      if (!isAuthenticated && !isAuthRoute) {
        return RouteNames.signIn;
      }

      if (isAuthenticated && isAuthRoute) {
        return RouteNames.workspaceList;
      }

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
        builder: (context, state, child) => AppScaffold(child: child),
        routes: [
          GoRoute(
            path: '/workspace/:workspaceId/home',
            name: 'workspaceHome',
            builder: (context, state) => WorkspaceHomePage(
              workspaceId: state.pathParameters['workspaceId']!,
            ),
          ),
        ],
      ),
    ],
  );
});
