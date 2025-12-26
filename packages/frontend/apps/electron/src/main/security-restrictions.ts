import { app, protocol } from 'electron';

import { anotherHost, mainHost } from './constants';
import { openExternalSafely } from './security/open-external';

const extractRedirectTarget = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    const redirectUri = parsed.searchParams.get('redirect_uri');
    if (redirectUri) {
      return redirectUri;
    }

    if (parsed.hash) {
      const hash = parsed.hash.startsWith('#')
        ? parsed.hash.slice(1)
        : parsed.hash;

      const queryIndex = hash.indexOf('?');
      if (queryIndex !== -1) {
        const hashParams = new URLSearchParams(hash.slice(queryIndex + 1));
        const hashRedirect = hashParams.get('redirect_uri');
        if (hashRedirect) {
          return hashRedirect;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
};

app.on('web-contents-created', (_, contents) => {
  const isInternalUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === 'assets:' &&
        (parsed.hostname === mainHost || parsed.hostname === anotherHost)
      ) {
        return true;
      }
    } catch {}
    return false;
  };
  /**
   * Block navigation to origins not on the allowlist.
   *
   * Navigation is a common attack vector. If an attacker can convince the app to navigate away
   * from its current page, they can possibly force the app to open web sites on the Internet.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-navigation
   */
  contents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }
    // Prevent navigation
    event.preventDefault();
    openExternalSafely(url).catch(error => {
      console.error('[security] Failed to open external URL:', error);
    });
  });

  /**
   * Hyperlinks to allowed sites open in the default browser.
   *
   * The creation of new `webContents` is a common attack vector. Attackers attempt to convince the app to create new windows,
   * frames, or other renderer processes with more privileges than they had before; or with pages opened that they couldn't open before.
   * You should deny any unexpected window creation.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
   * @see https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-openexternal-with-untrusted-content
   */
  contents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      openExternalSafely(url).catch(error => {
        console.error('[security] Failed to open external URL:', error);
      });
    } else if (url.includes('/redirect-proxy')) {
      const redirectTarget = extractRedirectTarget(url);
      if (redirectTarget) {
        openExternalSafely(redirectTarget).catch(error => {
          console.error('[security] Failed to open external URL:', error);
        });
      } else {
        console.warn(
          '[security] Blocked redirect proxy with missing redirect target:',
          url
        );
      }
    }
    // Prevent creating new window in application
    return { action: 'deny' };
  });
});

type CustomScheme = {
  scheme: string;
  privileges?: Record<string, boolean>;
};

const original = protocol.registerSchemesAsPrivileged.bind(protocol);

// use Map to merge (OR the privileges of the same-named schemes)
const bucket = new Map<string, CustomScheme>();
let flushed = false;

function mergeSchemes(list: CustomScheme[]) {
  for (const item of list ?? []) {
    const prev = bucket.get(item.scheme);
    if (!prev) {
      bucket.set(item.scheme, {
        scheme: item.scheme,
        privileges: { ...(item.privileges ?? {}) },
      });
    } else {
      const merged: Record<string, boolean> = { ...(prev.privileges ?? {}) };
      for (const [k, v] of Object.entries(item.privileges ?? {})) {
        merged[k] = Boolean(merged[k] || v);
      }
      prev.privileges = merged;
    }
  }
}

// make a once-only API into a collecting one
(protocol as any).registerSchemesAsPrivileged = (schemes: CustomScheme[]) => {
  if (flushed) return;
  mergeSchemes(schemes);
};

export const flushProtocol = () => {
  if (flushed) return;
  flushed = true;
  const merged = Array.from(bucket.values());
  original(merged);
};
