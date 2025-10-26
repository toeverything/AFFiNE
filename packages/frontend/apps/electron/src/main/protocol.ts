import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, net, protocol, session } from 'electron';
import cookieParser from 'set-cookie-parser';

import { isWindows, resourcesPath } from '../shared/utils';
import { anotherHost, mainHost } from './constants';
import { logger } from './logger';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'assets',
    privileges: {
      secure: false,
      corsEnabled: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
    },
  },
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'file',
    privileges: {
      secure: false,
      corsEnabled: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

const webStaticDir = join(resourcesPath, 'web-static');

async function handleFileRequest(request: Request) {
  const urlObject = new URL(request.url);

  if (urlObject.host === anotherHost) {
    urlObject.host = mainHost;
  }

  const isAbsolutePath = urlObject.host !== '.';

  // Redirect to webpack dev server if defined
  if (process.env.DEV_SERVER_URL && !isAbsolutePath) {
    const devServerUrl = new URL(
      urlObject.pathname,
      process.env.DEV_SERVER_URL
    );
    return net.fetch(devServerUrl.toString(), request);
  }
  const clonedRequest = Object.assign(request.clone(), {
    bypassCustomProtocolHandlers: true,
  });
  // this will be file types (in the web-static folder)
  let filepath = '';

  // for relative path, load the file in resources
  if (!isAbsolutePath) {
    if (urlObject.pathname.split('/').at(-1)?.includes('.')) {
      // Sanitize pathname to prevent path traversal attacks
      const decodedPath = decodeURIComponent(urlObject.pathname);
      const normalizedPath = join(webStaticDir, decodedPath).normalize();
      if (!normalizedPath.startsWith(webStaticDir)) {
        // Attempted path traversal - reject by using empty path
        filepath = join(webStaticDir, '');
      } else {
        filepath = normalizedPath;
      }
    } else {
      // else, fallback to load the index.html instead
      filepath = join(webStaticDir, 'index.html');
    }
  } else {
    filepath = decodeURIComponent(urlObject.pathname);
    // on windows, the path could be start with '/'
    if (isWindows()) {
      filepath = path.resolve(filepath.replace(/^\//, ''));
    }
    // security check if the filepath is within app.getPath('sessionData')
    const sessionDataPath = path
      .resolve(app.getPath('sessionData'))
      .toLowerCase();
    const tempPath = path.resolve(app.getPath('temp')).toLowerCase();
    if (
      !filepath.toLowerCase().startsWith(sessionDataPath) &&
      !filepath.toLowerCase().startsWith(tempPath)
    ) {
      throw new Error('Invalid filepath');
    }
  }
  return net.fetch(pathToFileURL(filepath).toString(), clonedRequest);
}

// whitelist for cors
// url patterns that are allowed to have cors headers
const corsWhitelist = [
  /^(?:[a-zA-Z0-9-]+\.)*googlevideo\.com$/,
  /^(?:[a-zA-Z0-9-]+\.)*youtube\.com$/,
];

export function registerProtocol() {
  protocol.handle('file', request => {
    return handleFileRequest(request);
  });

  protocol.handle('assets', request => {
    return handleFileRequest(request);
  });

  session.defaultSession.webRequest.onHeadersReceived(
    (responseDetails, callback) => {
      const { responseHeaders, url } = responseDetails;
      (async () => {
        if (responseHeaders) {
          const originalCookie =
            responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];

          if (originalCookie) {
            // save the cookies, to support third party cookies
            for (const cookies of originalCookie) {
              const parsedCookies = cookieParser.parse(cookies);
              for (const parsedCookie of parsedCookies) {
                if (!parsedCookie.value) {
                  await session.defaultSession.cookies.remove(
                    responseDetails.url,
                    parsedCookie.name
                  );
                } else {
                  await session.defaultSession.cookies.set({
                    url: responseDetails.url,
                    domain: parsedCookie.domain,
                    expirationDate: parsedCookie.expires?.getTime(),
                    httpOnly: parsedCookie.httpOnly,
                    secure: parsedCookie.secure,
                    value: parsedCookie.value,
                    name: parsedCookie.name,
                    path: parsedCookie.path,
                    sameSite: parsedCookie.sameSite?.toLowerCase() as
                      | 'unspecified'
                      | 'no_restriction'
                      | 'lax'
                      | 'strict'
                      | undefined,
                  });
                }
              }
            }
          }

          const hostname = new URL(url).hostname;
          if (!corsWhitelist.some(domainRegex => domainRegex.test(hostname))) {
            delete responseHeaders['access-control-allow-origin'];
            delete responseHeaders['access-control-allow-headers'];
            delete responseHeaders['Access-Control-Allow-Origin'];
            delete responseHeaders['Access-Control-Allow-Headers'];
          }

          // to allow url embedding, remove "x-frame-options",
          // if response header contains "content-security-policy", remove "frame-ancestors/frame-src"
          delete responseHeaders['x-frame-options'];
          delete responseHeaders['X-Frame-Options'];

          // Handle Content Security Policy headers
          const cspHeaders = [
            'content-security-policy',
            'Content-Security-Policy',
          ];
          for (const cspHeader of cspHeaders) {
            const cspValues = responseHeaders[cspHeader];
            if (cspValues) {
              // Remove frame-ancestors and frame-src directives from CSP
              const modifiedCspValues = cspValues
                .map(cspValue => {
                  if (typeof cspValue === 'string') {
                    return cspValue
                      .split(';')
                      .filter(directive => {
                        const trimmed = directive.trim().toLowerCase();
                        return (
                          !trimmed.startsWith('frame-ancestors') &&
                          !trimmed.startsWith('frame-src')
                        );
                      })
                      .join(';');
                  }
                  return cspValue;
                })
                .filter(
                  value => value && typeof value === 'string' && value.trim()
                );

              if (modifiedCspValues.length > 0) {
                responseHeaders[cspHeader] = modifiedCspValues;
              } else {
                delete responseHeaders[cspHeader];
              }
            }
          }
        }
      })()
        .catch(err => {
          logger.error('error handling headers received', err);
        })
        .finally(() => {
          callback({ responseHeaders });
        });
    }
  );

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = new URL(details.url);

    (async () => {
      // session cookies are set to file:// on production
      // if sending request to the cloud, attach the session cookie (to affine cloud server)
      if (
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'ws:' ||
        url.protocol === 'wss:'
      ) {
        const cookies = await session.defaultSession.cookies.get({
          url: details.url,
        });

        const cookieString = cookies
          .map(c => `${c.name}=${c.value}`)
          .join('; ');
        delete details.requestHeaders['cookie'];
        details.requestHeaders['Cookie'] = cookieString;
      }
    })()
      .catch(err => {
        logger.error('error handling before send headers', err);
      })
      .finally(() => {
        callback({
          cancel: false,
          requestHeaders: details.requestHeaders,
        });
      });
  });
}
