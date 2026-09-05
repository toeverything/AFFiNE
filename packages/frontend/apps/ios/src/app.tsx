import { notify } from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { AffineContext } from '@affine/core/components/context';
import { AppFallback } from '@affine/core/mobile/components/app-fallback';
import { MobileModalConfigProvider } from '@affine/core/mobile/components/mobile-modal-config-provider';
import { ShareImportController } from '@affine/core/mobile/components/share-import-controller';
import { configureMobileModules } from '@affine/core/mobile/modules';
import { MobileBackCoordinator } from '@affine/core/mobile/modules/back-coordinator';
import { HapticProvider } from '@affine/core/mobile/modules/haptics';
import { VirtualKeyboardProvider } from '@affine/core/mobile/modules/virtual-keyboard';
import { router } from '@affine/core/mobile/router';
import { getCurrentNativeUserIdentifier } from '@affine/core/mobile/utils/native-user-identifier';
import { configureCommonModules } from '@affine/core/modules';
import {
  AuthProvider,
  AuthService,
  DefaultServerService,
  ServerScope,
  ServerService,
  ServersService,
  SubscriptionService,
  ValidatorProvider,
} from '@affine/core/modules/cloud';
import { registerNativePreviewHandlers } from '@affine/core/modules/code-block-preview-renderer';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { I18nProvider } from '@affine/core/modules/i18n';
import { LifecycleService } from '@affine/core/modules/lifecycle';
import { NativePaywallProvider } from '@affine/core/modules/paywall';
import {
  configureLocalStorageStateStorageImpls,
  NbstoreProvider,
} from '@affine/core/modules/storage';
import { PopupWindowProvider, UrlService } from '@affine/core/modules/url';
import { ClientSchemeProvider } from '@affine/core/modules/url/providers/client-schema';
import {
  configureBrowserWorkbenchModule,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import {
  getAFFiNEWorkspaceSchema,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { configureBrowserWorkspaceFlavours } from '@affine/core/modules/workspace-engine';
import { getWorkerUrl } from '@affine/env/worker';
import {
  OAuthProviderType,
  refreshSubscriptionMutation,
  requestApplySubscriptionMutation,
} from '@affine/graphql';
import { I18n } from '@affine/i18n';
import { serveAuthRequests } from '@affine/mobile-shared/auth/channel';
import { StoreManagerClient } from '@affine/nbstore/worker/client';
import { setTelemetryTransport } from '@affine/track';
import { Container } from '@blocksuite/affine/global/di';
import {
  docLinkBaseURLMiddleware,
  MarkdownAdapter,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { registerNativeImageFilesPicker } from '@blocksuite/affine/shared/utils';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import {
  Framework,
  FrameworkRoot,
  getCurrentStore,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { OpClient } from '@toeverything/infra/op';
import { AsyncCall } from 'async-call-rpc';
import { AppTrackingTransparency } from 'capacitor-plugin-app-tracking-transparency';
import { useTheme } from 'next-themes';
import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { BlocksuiteMenuConfigProvider } from './bs-menu-config';
import { AffineTheme } from './plugins/affine-theme';
import { Auth } from './plugins/auth';
import { Hashcash } from './plugins/hashcash';
import { ImagePicker } from './plugins/image-picker';
import { NavigationGesture } from './plugins/navigation-gesture';
import { NbStoreNativeDBApis } from './plugins/nbstore';
import { PayWall } from './plugins/paywall';
import { Preview } from './plugins/preview';
import { shareInboxProvider } from './plugins/share-inbox';
import {
  authRequestProvider,
  clearEndpointSession,
  getValidAccessToken,
} from './proxy';

const storeManagerClient = createStoreManagerClient();
setTelemetryTransport(storeManagerClient.telemetry);
window.addEventListener('beforeunload', () => {
  storeManagerClient.dispose();
});

const waitForSubscriptionRevalidation = async (
  subscriptionService: SubscriptionService,
  fallbackMessage: string
) => {
  await subscriptionService.subscription.waitForRevalidation();
  const error = subscriptionService.subscription.error$.value;
  if (error) {
    throw error instanceof Error
      ? error
      : new Error(getErrorMessage(error, fallbackMessage));
  }
};

const future = {
  v7_startTransition: true,
} as const;

const framework = new Framework();
configureCommonModules(framework);
configureBrowserWorkbenchModule(framework);
configureLocalStorageStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureMobileModules(framework);
framework.impl(NbstoreProvider, {
  realtime: storeManagerClient.realtime,
  openStore(key, options) {
    const { store, dispose } = storeManagerClient.open(key, options);
    return {
      store,
      dispose: () => {
        dispose();
      },
    };
  },
});
framework.impl(PopupWindowProvider, {
  open: (url: string) => {
    Browser.open({
      url,
      presentationStyle: 'popover',
    }).catch(console.error);
  },
});
framework.impl(ClientSchemeProvider, {
  getClientScheme() {
    return 'affine';
  },
});
framework.impl(ValidatorProvider, {
  async validate(_challenge, resource) {
    const res = await Hashcash.hash({ challenge: resource });
    return res.value;
  },
});
framework.impl(VirtualKeyboardProvider, {
  // We dose not provide show and hide because:
  // - Keyboard.show() is not implemented
  // - Keyboard.hide() will blur the current editor
  onChange: callback => {
    let disposeRef = {
      dispose: () => {},
    };
    let viewportDispose = () => {};
    let pluginKeyboardHeight = 0;
    let pluginKeyboardVisible = false;

    const getViewportKeyboardHeight = () => {
      const viewport = window.visualViewport;
      if (!viewport) {
        return 0;
      }
      return Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop
      );
    };

    const emitKeyboardState = () => {
      const viewportKeyboardHeight = getViewportKeyboardHeight();
      const effectiveKeyboardHeight = Math.max(
        pluginKeyboardHeight,
        viewportKeyboardHeight
      );

      callback({
        visible: pluginKeyboardVisible || effectiveKeyboardHeight > 0,
        height: effectiveKeyboardHeight,
      });
    };

    const viewport = window.visualViewport;
    if (viewport) {
      const handleViewportChange = () => {
        emitKeyboardState();
      };
      viewport.addEventListener('resize', handleViewportChange);
      viewport.addEventListener('scroll', handleViewportChange);
      viewportDispose = () => {
        viewport.removeEventListener('resize', handleViewportChange);
        viewport.removeEventListener('scroll', handleViewportChange);
      };
    }

    Promise.all([
      Keyboard.addListener('keyboardWillShow', info => {
        pluginKeyboardVisible = info.keyboardHeight !== 0;
        pluginKeyboardHeight = info.keyboardHeight;
        emitKeyboardState();
      }),
      Keyboard.addListener('keyboardWillHide', () => {
        pluginKeyboardVisible = false;
        pluginKeyboardHeight = 0;
        emitKeyboardState();
      }),
    ])
      .then(handlers => {
        disposeRef.dispose = () => {
          Promise.all(handlers.map(handler => handler.remove())).catch(
            console.error
          );
        };
      })
      .catch(console.error);

    emitKeyboardState();

    return () => {
      disposeRef.dispose();
      viewportDispose();
    };
  },
});
framework.impl(HapticProvider, {
  impact: options => Haptics.impact(options as any),
  vibrate: options => Haptics.vibrate(options as any),
  notification: options => Haptics.notification(options as any),
  selectionStart: () => Haptics.selectionStart(),
  selectionChanged: () => Haptics.selectionChanged(),
  selectionEnd: () => Haptics.selectionEnd(),
});
framework.scope(ServerScope).override(AuthProvider, resolver => {
  const serverService = resolver.get(ServerService);
  const endpoint = serverService.server.baseUrl;
  return {
    async signInMagicLink(email, linkToken, clientNonce) {
      await Auth.signInMagicLink({
        endpoint,
        email,
        token: linkToken,
        clientNonce,
      });
    },
    async signInOauth(code, state, _provider, clientNonce) {
      await Auth.signInOauth({
        endpoint,
        code,
        state,
        clientNonce,
      });
      return {};
    },
    async signInPassword(credential) {
      await Auth.signInPassword({
        endpoint,
        ...credential,
      });
    },
    async signInOpenAppSignInCode(code) {
      await Auth.signInOpenApp({
        endpoint,
        code,
      });
    },
    async signOut() {
      try {
        await Auth.signOut({ endpoint });
      } finally {
        await clearEndpointSession(endpoint);
      }
    },
    async clearSession() {
      await clearEndpointSession(endpoint);
    },
  };
});
framework.impl(NativePaywallProvider, {
  showPaywall: async (type: 'Pro' | 'AI') => {
    await PayWall.showPayWall({ type });
  },
});

const frameworkProvider = framework.provider();
let cancelActiveRequestSignIn: (() => void) | null = null;
let activeNativeSignInPromise: Promise<string | null> | null = null;

registerNativePreviewHandlers({
  renderMermaidSvg: request => Preview.renderMermaidSvg(request),
  renderTypstSvg: request => Preview.renderTypstSvg(request),
});
registerNativeImageFilesPicker(async () => {
  const result = await ImagePicker.pickImages({ multiple: true });
  if (result.canceled || result.files.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    result.files.map(async file => {
      const filePath = file.path.startsWith('file://')
        ? file.path
        : `file://${file.path}`;
      const response = await fetch(Capacitor.convertFileSrc(filePath));
      if (!response.ok) {
        throw new Error(
          `Failed to read image picker file: ${file.name} (status ${response.status})`
        );
      }

      const blob = await response.blob();
      return new File([blob], file.name, {
        type: file.mimeType || blob.type || 'image/*',
        lastModified: file.lastModified,
      });
    })
  );

  return settled
    .filter(
      (settledResult): settledResult is PromiseFulfilledResult<File> =>
        settledResult.status === 'fulfilled'
    )
    .map(settledResult => settledResult.value);
});

// ------ some apis for native ------
const getCurrentServerForNative = () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const globalContext = globalContextService.globalContext;
  const currentServerId = globalContext.serverId.get();
  const currentWorkspaceFlavour = globalContext.workspaceFlavour.get();
  const serversService = frameworkProvider.get(ServersService);
  const defaultServerService = frameworkProvider.get(DefaultServerService);

  if (currentWorkspaceFlavour && currentWorkspaceFlavour !== 'local') {
    const workspaceServer = serversService.server$(
      currentWorkspaceFlavour
    ).value;
    if (workspaceServer) {
      return workspaceServer;
    }
  }

  return (
    (currentServerId ? serversService.server$(currentServerId).value : null) ??
    defaultServerService.server
  );
};

(window as any).getCurrentServerBaseUrl = () => {
  return getCurrentServerForNative().baseUrl;
};
(window as any).getCurrentI18nLocale = () => {
  return I18n.language;
};
(window as any).getCurrentThemeMode = () => {
  return 'system';
};
(window as any).getAiButtonFeatureFlag = () => {
  const featureFlagService = frameworkProvider.get(FeatureFlagService);
  return featureFlagService.flags.enable_mobile_ai_button.value;
};
(window as any).getCurrentWorkspaceId = () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  return globalContextService.globalContext.workspaceId.get();
};
(window as any).getCurrentDocId = () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  return globalContextService.globalContext.docId.get();
};
(window as any).waitForSelectedSources = async (documentIds: string[]) => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const globalContext = globalContextService.globalContext;
  const currentWorkspaceId = globalContext.workspaceId.get();
  const currentWorkspaceFlavour = globalContext.workspaceFlavour.get();
  const workspacesService = frameworkProvider.get(WorkspacesService);
  const workspaceRef = currentWorkspaceId
    ? workspacesService.openByWorkspaceId(
        currentWorkspaceId,
        currentWorkspaceFlavour
      )
    : null;
  if (!workspaceRef) {
    throw new Error('Current workspace is unavailable');
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { workspace } = workspaceRef;
    await Promise.race([
      Promise.all(
        [workspace.id, 'db$docProperties', ...new Set(documentIds)].map(docId =>
          workspace.engine.doc.waitForSynced(docId)
        )
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Selected source synchronization timed out')),
          15000
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    workspaceRef.dispose();
  }
};
(window as any).getCurrentUserIdentifier = async () => {
  const { authService } = getCurrentNativeSignInContext();
  return await getCurrentNativeUserIdentifier(authService);
};
(window as any).cancelRequestSignIn = () => {
  if (!cancelActiveRequestSignIn) {
    return false;
  }
  cancelActiveRequestSignIn();
  return true;
};
const getCurrentNativeSignInContext = () => {
  const currentServer = getCurrentServerForNative();
  const authService = currentServer.scope.get(AuthService);
  return { authService, currentServer };
};

(window as any).nativeStartOAuthSignIn = async (
  provider: 'Google' | 'Apple'
) => {
  const { authService } = getCurrentNativeSignInContext();
  const urlService = frameworkProvider.get(UrlService);
  const scheme = urlService.getClientScheme();
  const oauthProvider =
    provider === 'Apple' ? OAuthProviderType.Apple : OAuthProviderType.Google;
  const options = await authService.oauthPreflight(
    oauthProvider,
    scheme ?? 'web'
  );
  return options.url;
};

(window as any).nativeCheckEmailSignInMethods = async (email: string) => {
  const { authService } = getCurrentNativeSignInContext();
  const { methods } = await authService.checkUserByEmail(email);
  return {
    hasPassword: !!methods.password.available,
    canUseMagicLink: !!methods.magicLink.available,
  };
};

(window as any).nativeSendEmailMagicLink = async (email: string) => {
  const { authService } = getCurrentNativeSignInContext();
  await authService.sendEmailMagicLink(email);
  return true;
};

(window as any).nativeSignInWithMagicLink = async (
  email: string,
  token: string
) => {
  const { authService } = getCurrentNativeSignInContext();
  await authService.signInMagicLink(email, token, false);
  const session = await authService.session.waitForAuthenticated();
  return session.session.account.id;
};

(window as any).nativeSignInWithPassword = async (
  email: string,
  password: string
) => {
  const { authService } = getCurrentNativeSignInContext();
  await authService.signInPassword({ email, password });
  const session = await authService.session.waitForAuthenticated();
  return session.session.account.id;
};

(window as any).nativeOpenSelfHostedSignIn = async () => {
  const globalDialogService = frameworkProvider.get(GlobalDialogService);
  globalDialogService.open('sign-in', { step: 'addSelfhosted' });
  return true;
};

const showNativeSignIn = async () => {
  const { authService } = getCurrentNativeSignInContext();
  const account = authService.session.account$.value;
  if (account?.id) {
    return account.id;
  }
  if (activeNativeSignInPromise) {
    const result = await activeNativeSignInPromise;
    const authenticatedAccount = authService.session.account$.value;
    if (authenticatedAccount?.id) {
      return authenticatedAccount.id;
    }
    return result;
  }

  let cancelRequestSignIn!: () => void;
  const cancelledSignIn = new Promise<{ success: false }>(resolve => {
    cancelRequestSignIn = () => resolve({ success: false });
  });
  cancelActiveRequestSignIn = cancelRequestSignIn;

  activeNativeSignInPromise = (async () => {
    const result = await Promise.race([
      Auth.showNativeSignIn(),
      cancelledSignIn,
    ]);
    if (!result.success) {
      return null;
    }

    const authenticatedAccount = authService.session.account$.value;
    if (authenticatedAccount?.id) {
      return authenticatedAccount.id;
    }

    const session = await authService.session.waitForAuthenticated();
    return session.session.account.id;
  })();

  try {
    return await activeNativeSignInPromise;
  } finally {
    if (cancelActiveRequestSignIn === cancelRequestSignIn) {
      cancelActiveRequestSignIn = null;
    }
    activeNativeSignInPromise = null;
  }
};

(window as any).showNativeSignIn = showNativeSignIn;

(window as any).requestSignIn = async () => {
  return await showNativeSignIn();
};

(window as any).getCurrentDocContentInMarkdown = async () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const globalContext = globalContextService.globalContext;
  const currentWorkspaceId = globalContext.workspaceId.get();
  const currentWorkspaceFlavour = globalContext.workspaceFlavour.get();
  const currentDocId = globalContext.docId.get();
  const workspacesService = frameworkProvider.get(WorkspacesService);
  const workspaceRef = currentWorkspaceId
    ? workspacesService.openByWorkspaceId(
        currentWorkspaceId,
        currentWorkspaceFlavour
      )
    : null;
  if (!workspaceRef) {
    return;
  }

  const { workspace, dispose: disposeWorkspace } = workspaceRef;

  const docsService = workspace.scope.get(DocsService);
  const docRef = currentDocId ? docsService.open(currentDocId) : null;
  if (!docRef) {
    disposeWorkspace();
    return;
  }
  const { doc, release: disposeDoc } = docRef;

  try {
    const blockSuiteDoc = doc.blockSuiteDoc;

    const transformer = blockSuiteDoc.getTransformer([
      docLinkBaseURLMiddleware(blockSuiteDoc.workspace.id),
      titleMiddleware(blockSuiteDoc.workspace.meta.docMetas),
    ]);
    const snapshot = transformer.docToSnapshot(blockSuiteDoc);

    const container = new Container();
    getStoreManager()
      .config.init()
      .value.get('store')
      .forEach(ext => {
        ext.setup(container);
      });
    const provider = container.provider();

    const adapter = new MarkdownAdapter(transformer, provider);
    if (!snapshot) {
      return;
    }

    const markdownResult = await adapter.fromDocSnapshot({
      snapshot,
      assets: transformer.assetsManager,
    });
    return markdownResult.file;
  } finally {
    disposeDoc();
    disposeWorkspace();
  }
};
(window as any).createNewDocByMarkdownInCurrentWorkspace = async (
  markdown: string,
  title: string
) => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const globalContext = globalContextService.globalContext;
  const currentWorkspaceId = globalContext.workspaceId.get();
  const currentWorkspaceFlavour = globalContext.workspaceFlavour.get();
  const workspacesService = frameworkProvider.get(WorkspacesService);
  const workspaceRef = currentWorkspaceId
    ? workspacesService.openByWorkspaceId(
        currentWorkspaceId,
        currentWorkspaceFlavour
      )
    : null;

  try {
    const workspace = workspaceRef?.workspace;
    if (!workspace) {
      return;
    }

    const workbench = workspace.scope.get(WorkbenchService).workbench;
    await workspace.engine.doc.waitForDocReady(workspace.id);
    const docId = await MarkdownTransformer.importMarkdownToDoc({
      collection: workspace.docCollection,
      schema: getAFFiNEWorkspaceSchema(),
      markdown,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    const docsService = workspace.scope.get(DocsService);
    if (!docId) {
      throw new Error('Failed to import doc');
    }
    await docsService.changeDocTitle(docId, title);
    docsService.list.setPrimaryMode(docId, 'page');
    workbench.openDoc(docId);
    return docId;
  } finally {
    workspaceRef?.dispose();
  }
};
(window as any).getSubscriptionState = async () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const currentServerId = globalContextService.globalContext.serverId.get();
  const serversService = frameworkProvider.get(ServersService);
  const defaultServerService = frameworkProvider.get(DefaultServerService);
  const currentServer =
    (currentServerId ? serversService.server$(currentServerId).value : null) ??
    defaultServerService.server;
  const subscriptionService = currentServer.scope.get(SubscriptionService);
  await waitForSubscriptionRevalidation(
    subscriptionService,
    'Unable to refresh subscription state.'
  );
  return {
    pro: subscriptionService.subscription.pro$.value,
    ai: subscriptionService.subscription.ai$.value,
  };
};
(window as any).updateSubscriptionState = async () => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const currentServerId = globalContextService.globalContext.serverId.get();
  const serversService = frameworkProvider.get(ServersService);
  const defaultServerService = frameworkProvider.get(DefaultServerService);
  const currentServer =
    (currentServerId ? serversService.server$(currentServerId).value : null) ??
    defaultServerService.server;
  await currentServer.gql({
    query: refreshSubscriptionMutation,
  });
  const subscriptionService = currentServer.scope.get(SubscriptionService);
  await waitForSubscriptionRevalidation(
    subscriptionService,
    'Unable to refresh subscription state.'
  );
};
(window as any).requestApplySubscription = async (transactionId: string) => {
  const globalContextService = frameworkProvider.get(GlobalContextService);
  const currentServerId = globalContextService.globalContext.serverId.get();
  const serversService = frameworkProvider.get(ServersService);
  const defaultServerService = frameworkProvider.get(DefaultServerService);
  const currentServer =
    (currentServerId ? serversService.server$(currentServerId).value : null) ??
    defaultServerService.server;
  await currentServer.gql({
    query: requestApplySubscriptionMutation,
    variables: { transactionId },
  });
  const subscriptionService = currentServer.scope.get(SubscriptionService);
  await waitForSubscriptionRevalidation(
    subscriptionService,
    'Unable to refresh subscription state after purchase.'
  );
};

// setup application lifecycle events, and emit application start event
window.addEventListener('focus', () => {
  frameworkProvider.get(LifecycleService).applicationFocus();
});
frameworkProvider.get(LifecycleService).applicationStart();
CapacitorApp.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) return;
  const servers = frameworkProvider.get(ServersService).servers$.value;
  Promise.allSettled(
    servers.map(server => getValidAccessToken(server.baseUrl))
  ).catch(console.error);
}).catch(console.error);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const notifyAuthenticationError = (error: unknown, fallback: string) => {
  console.error(fallback, error);
  notify.error({
    title: I18n['com.affine.auth.toast.title.failed'](),
    message: getErrorMessage(error, fallback),
  });
};

const handleAuthenticationCallback = async (url: string) => {
  const urlObj = new URL(url);

  if (urlObj.hostname !== 'authentication') {
    return;
  }

  const method = urlObj.searchParams.get('method');
  const payload = JSON.parse(urlObj.searchParams.get('payload') ?? 'false');
  const serverBaseUrl = urlObj.searchParams.get('server');

  if (!method || (method !== 'magic-link' && method !== 'oauth') || !payload) {
    throw new Error('Invalid authentication url');
  }

  let authService = frameworkProvider
    .get(DefaultServerService)
    .server.scope.get(AuthService);

  if (serverBaseUrl) {
    const serversService = frameworkProvider.get(ServersService);
    const server = serversService.getServerByBaseUrl(serverBaseUrl);
    if (!server) {
      throw new Error(
        `Authentication callback server not found: ${serverBaseUrl}`
      );
    }
    authService = server.scope.get(AuthService);
  }

  if (method === 'oauth') {
    await authService.signInOauth(
      payload.code,
      payload.state,
      payload.provider
    );
  } else if (method === 'magic-link') {
    await authService.signInMagicLink(payload.email, payload.token);
  }
};

(window as any).nativeHandleAuthenticationCallback = async (url: string) => {
  await handleAuthenticationCallback(url);
  return true;
};

CapacitorApp.addListener('appUrlOpen', ({ url }) => {
  // try to close browser if it's open
  Browser.close().catch(e => console.error('Failed to close browser', e));
  handleAuthenticationCallback(url).catch(error =>
    notifyAuthenticationError(error, 'Failed to handle authentication callback')
  );
}).catch(e => {
  notifyAuthenticationError(e, 'Failed to handle authentication callback');
});

AppTrackingTransparency.requestPermission().catch(e => {
  console.error('Failed to request app tracking transparency permission', e);
});

const KeyboardThemeProvider = () => {
  const { resolvedTheme, theme } = useTheme();

  useEffect(() => {
    Keyboard.setStyle({
      style:
        resolvedTheme === 'dark'
          ? KeyboardStyle.Dark
          : resolvedTheme === 'light'
            ? KeyboardStyle.Light
            : KeyboardStyle.Default,
    }).catch(e => {
      console.error(`Failed to set keyboard style: ${e}`);
    });
  }, [resolvedTheme]);

  useEffect(() => {
    if (!theme && !resolvedTheme) {
      return;
    }

    const themeMode: 'dark' | 'light' | 'system' =
      theme === 'dark' || theme === 'light' || theme === 'system'
        ? theme
        : resolvedTheme === 'dark'
          ? 'dark'
          : resolvedTheme === 'light'
            ? 'light'
            : 'system';
    (window as any).getCurrentThemeMode = () => {
      return themeMode;
    };
    AffineTheme.onThemeChanged({
      themeMode,
    }).catch(e => {
      console.error(`Failed to sync app theme: ${e}`);
    });
  }, [resolvedTheme, theme]);

  return null;
};

const IOSBackAdapter = () => {
  const coordinator = useService(MobileBackCoordinator);
  const enabled = useLiveData(coordinator.canInteractivePop$);

  useEffect(() => {
    (enabled ? NavigationGesture.enable() : NavigationGesture.disable()).catch(
      console.error
    );
  }, [enabled]);

  useEffect(() => {
    let disposed = false;
    let remove = () => {};
    NavigationGesture.addListener('gesture', event => {
      coordinator.handleInteractivePhase(event.phase);
    })
      .then(handle => {
        if (disposed) handle.remove().catch(console.error);
        else
          remove = () => {
            handle.remove().catch(console.error);
          };
      })
      .catch(console.error);
    return () => {
      disposed = true;
      remove();
      NavigationGesture.disable().catch(console.error);
    };
  }, [coordinator]);

  return null;
};

export function App() {
  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <I18nProvider>
          <MobileModalConfigProvider>
            <AffineContext store={getCurrentStore()}>
              <KeyboardThemeProvider />
              <IOSBackAdapter />
              <ShareImportController provider={shareInboxProvider} />
              <BlocksuiteMenuConfigProvider>
                <RouterProvider
                  fallbackElement={<AppFallback />}
                  router={router}
                  future={future}
                />
              </BlocksuiteMenuConfigProvider>
            </AffineContext>
          </MobileModalConfigProvider>
        </I18nProvider>
      </FrameworkRoot>
    </Suspense>
  );
}

function createStoreManagerClient() {
  const worker = new Worker(getWorkerUrl('nbstore'));
  const { port1: nativeDBApiChannelServer, port2: nativeDBApiChannelClient } =
    new MessageChannel();
  AsyncCall<typeof NbStoreNativeDBApis>(NbStoreNativeDBApis, {
    channel: {
      on(listener) {
        const f = (e: MessageEvent<any>) => listener(e.data);
        nativeDBApiChannelServer.addEventListener('message', f);
        return () => nativeDBApiChannelServer.removeEventListener('message', f);
      },
      send(data) {
        nativeDBApiChannelServer.postMessage(data);
      },
    },
    log: false,
  });
  nativeDBApiChannelServer.start();
  worker.postMessage(
    { type: 'native-db-api-channel', port: nativeDBApiChannelClient },
    [nativeDBApiChannelClient]
  );

  const { port1: authTokenChannelServer, port2: authTokenChannelClient } =
    new MessageChannel();
  serveAuthRequests(authTokenChannelServer, authRequestProvider);
  worker.postMessage(
    { type: 'auth-access-token-channel', port: authTokenChannelClient },
    [authTokenChannelClient]
  );
  return new StoreManagerClient(new OpClient(worker));
}
