import { FACTORIES, lazy, RELATIVE_ROUTES } from '@affine/routes';
import { withSentryReactRouterV7Routing } from '@sentry/react';
import { useEffect, useState } from 'react';
import type { Params } from 'react-router';
import {
  redirect,
  Route,
  Routes as ReactRouterRoutes,
  useNavigate,
} from 'react-router';

import { AffineErrorComponent } from '../components/affine/affine-error-boundary/affine-error-fallback';
import { NavigateContext } from '../components/hooks/use-navigate-helper';
import { AppContainer } from './components/app-container';
import { RootWrapper } from './pages/root';
import {
  authLoader,
  magicLinkLoader,
  oauthCallbackLoader,
  oauthLoginLoader,
  onboardingLoader,
  redirectLoader,
} from './router-loader';
export function RootRouter() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // a hack to make sure router is ready
    setReady(true);
  }, []);

  return (
    ready && (
      <NavigateContext.Provider value={navigate}>
        <RootWrapper />
      </NavigateContext.Provider>
    )
  );
}
export const Index = lazy(async () => await import('./pages/index'));
export const Workspace = lazy(
  async () => await import('./pages/workspace/index')
);
export const NotFound = lazy(async () => await import('./pages/404'));
export const Expired = lazy(async () => await import('./pages/expired'));
export const Invite = lazy(async () => await import('./pages/invite'));
export const UpgradeSuccess = lazy(
  async () => await import('./pages/upgrade-success')
);
export const UpgradeSuccessTeam = lazy(
  async () => await import('./pages/upgrade-success/team')
);
export const UpgradeSuccessSelfHostedTeam = lazy(
  async () => await import('./pages/upgrade-success/self-host-team')
);
export const AIUpgradeSuccess = lazy(
  async () => await import('./pages/ai-upgrade-success')
);
export const Subscribe = lazy(async () => await import('./pages/subscribe'));
export const UpgradeToTeam = lazy(
  async () => await import('./pages/upgrade-to-team')
);
export const ThemeEditor = lazy(
  async () => await import('./pages/theme-editor')
);
export const ImportClipper = lazy(
  async () => await import('./pages/import-clipper')
);
export const ImportTemplate = lazy(
  async () => await import('./pages/import-template')
);
export const OpenApp = lazy(async () => await import('./pages/open-app'));
export const Onboarding = lazy(async () => await import('./pages/onboarding'));
export const Redirect = lazy(async () => await import('./pages/redirect'));
export const Auth = lazy(
  async () => await import(/* webpackChunkName: "auth" */ './pages/auth/auth')
);
export const SignIn = lazy(
  async () =>
    await import(/* webpackChunkName: "auth" */ './pages/auth/sign-in')
);
export const MagicLink = lazy(
  async () =>
    await import(/* webpackChunkName: "auth" */ './pages/auth/magic-link')
);
export const OAuthLogin = lazy(
  async () =>
    await import(/* webpackChunkName: "auth" */ './pages/auth/oauth-login')
);
export const OAuthCallback = lazy(
  async () =>
    await import(/* webpackChunkName: "auth" */ './pages/auth/oauth-callback')
);

// Define routes using JSX syntax for better type checking
export const routes = (
  <Route
    element={<RootRouter />}
    errorElement={<AffineErrorComponent />}
    hydrateFallbackElement={<AppContainer fallback />}
  >
    <Route path={RELATIVE_ROUTES.index}>
      <Route index element={<Index />} />
      <Route path={RELATIVE_ROUTES.workspace.index} element={<Workspace />} />
      <Route
        path={RELATIVE_ROUTES.share}
        loader={async ({ params }: { params: Params<string> }) => {
          return redirect(
            FACTORIES.workspace.doc({
              workspaceId: params.workspaceId ?? '',
              docId: params.pageId ?? '',
            })
          );
        }}
      />
      <Route path={RELATIVE_ROUTES.notFound} element={<NotFound />} />
      <Route path={RELATIVE_ROUTES.expired} element={<Expired />} />
      <Route path={RELATIVE_ROUTES.invite} element={<Invite />} />
      <Route path={RELATIVE_ROUTES.upgradeSuccess.index}>
        <Route index element={<UpgradeSuccess />} />
        <Route
          path={RELATIVE_ROUTES.upgradeSuccess.team}
          element={<UpgradeSuccessTeam />}
        />
        <Route
          path={RELATIVE_ROUTES.upgradeSuccess.selfHostTeam}
          element={<UpgradeSuccessSelfHostedTeam />}
        />
      </Route>
      <Route
        path={RELATIVE_ROUTES.aiUpgradeSuccess}
        element={<AIUpgradeSuccess />}
      />
      <Route
        path={RELATIVE_ROUTES.onboarding}
        element={<Onboarding />}
        loader={onboardingLoader}
      />
      <Route
        path={RELATIVE_ROUTES.redirect}
        element={<Redirect />}
        loader={redirectLoader}
      />
      <Route path={RELATIVE_ROUTES.subscribe} element={<Subscribe />} />
      <Route path={RELATIVE_ROUTES.upgradeToTeam} element={<UpgradeToTeam />} />
      <Route
        path={RELATIVE_ROUTES.tryCloud}
        loader={async () => {
          return redirect(
            FACTORIES.signIn() +
              `?redirect_uri=${encodeURIComponent('/?initCloud=true')}`
          );
        }}
      />
      <Route path={RELATIVE_ROUTES.themeEditor} element={<ThemeEditor />} />
      <Route path="clipper/import" element={<ImportClipper />} />
      <Route path={RELATIVE_ROUTES.template.index} element={<ImportTemplate />}>
        <Route
          path={RELATIVE_ROUTES.template.import}
          element={<ImportTemplate />}
        />
        <Route
          path={RELATIVE_ROUTES.template.preview}
          loader={async ({ request }: { request: Request }) => {
            const url = new URL(request.url);
            const workspaceId = url.searchParams.get('workspaceId');
            const docId = url.searchParams.get('docId');
            const templateName = url.searchParams.get('name');
            const templateMode = url.searchParams.get('mode');
            const snapshotUrl = url.searchParams.get('snapshotUrl');

            return redirect(
              FACTORIES.workspace.doc({
                workspaceId: workspaceId ?? '',
                docId: docId ?? '',
              }) +
                `?${new URLSearchParams({
                  isTemplate: 'true',
                  templateName: templateName ?? '',
                  snapshotUrl: snapshotUrl ?? '',
                  mode: templateMode ?? 'page',
                }).toString()}`
            );
          }}
        />
      </Route>

      <Route
        path={RELATIVE_ROUTES.auth}
        element={<Auth />}
        loader={authLoader}
      />
      <Route path={RELATIVE_ROUTES.signIn} element={<SignIn />} />
      <Route
        path={RELATIVE_ROUTES.magicLink}
        element={<MagicLink />}
        loader={magicLinkLoader}
      />
      <Route path={RELATIVE_ROUTES.oauth.index} element={<NotFound />}>
        <Route
          path={RELATIVE_ROUTES.oauth.login}
          element={<OAuthLogin />}
          loader={oauthLoginLoader}
        />
        <Route
          path={RELATIVE_ROUTES.oauth.callback}
          element={<OAuthCallback />}
          loader={oauthCallbackLoader}
        />
      </Route>
      <Route path={RELATIVE_ROUTES.openApp} element={<OpenApp />} />
      {/* deprecated, keep for old client compatibility */}
      {/* TODO(@forehalo): remove */}
      <Route path="desktop-signin" element={<OAuthLogin />} />
      {/* deprecated, keep for old client compatibility */}
      {/* use '/sign-in' */}
      {/* TODO(@forehalo): remove */}
      <Route path="signIn" element={<SignIn />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Route>
);

// Apply Sentry wrapper to ReactRouterRoutes if needed
const Routes = window.SENTRY_RELEASE
  ? withSentryReactRouterV7Routing(ReactRouterRoutes)
  : ReactRouterRoutes;

// Export Router component - will be wrapped by BrowserRouter in app.tsx
export const Router = () => <Routes>{routes}</Routes>;
