import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const API_PREFIXES = [
  '/api',
  '/graphql',
  '/socket.io',
  '/health',
  '/metrics',
  '/info',
];

function pathOnly(url: string): string {
  const path = url.split('?')[0] ?? '/';
  return path.length > 0 ? path : '/';
}

function isApiPath(urlPath: string): boolean {
  return API_PREFIXES.some(
    prefix => urlPath === prefix || urlPath.startsWith(`${prefix}/`)
  );
}

function safeResolve(root: string, urlPath: string): string | null {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, '');
  const candidate = resolve(root, relative);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    return null;
  }
  return candidate;
}

function spaIndex(root: string): string | null {
  const selfhost = join(root, 'selfhost.html');
  if (existsSync(selfhost)) {
    return selfhost;
  }
  const index = join(root, 'index.html');
  if (existsSync(index)) {
    return index;
  }
  return null;
}

function lookupFile(root: string, urlPath: string): string | null {
  const candidate = safeResolve(root, urlPath);
  if (!candidate) {
    return null;
  }
  if (existsSync(candidate)) {
    const stat = statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }
    if (stat.isDirectory()) {
      const nested = join(candidate, 'index.html');
      if (existsSync(nested) && statSync(nested).isFile()) {
        return nested;
      }
    }
  }
  return null;
}

function wantsSpa(urlPath: string): boolean {
  const last = urlPath.split('/').pop() ?? '';
  return last.length === 0 || !last.includes('.');
}

function sendFile(
  reply: FastifyReply,
  filePath: string,
  method: string
): FastifyReply {
  const stat = statSync(filePath);
  const type =
    MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  reply.header('content-type', type);
  reply.header('content-length', String(stat.size));
  if (method === 'HEAD') {
    return reply.send();
  }
  return reply.send(createReadStream(filePath));
}

function jsonNotFound(
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  return reply.status(404).send({
    error: 'not_found',
    message: `No route ${request.method} ${request.url}`,
    requestId: request.requestId,
  });
}

/**
 * Serves the MIT web bundle when `MOSAIC_STATIC_DIR` is set.
 * API / GraphQL / Socket.IO / health routes stay owned by earlier plugins.
 * Prefers `selfhost.html` (MOSAIC_SERVER=1 self-host entry) over `index.html`.
 */
export const staticPlugin = fp<{ dir: string }>(
  async (app, opts) => {
    const root = resolve(opts.dir);
    const index = spaIndex(root);

    const serve = async (request: FastifyRequest, reply: FastifyReply) => {
      const urlPath = pathOnly(request.url);
      if (isApiPath(urlPath)) {
        return jsonNotFound(request, reply);
      }
      const file = lookupFile(root, urlPath === '/' ? '/' : urlPath);
      if (file) {
        return sendFile(reply, file, request.method);
      }
      if (index && wantsSpa(urlPath)) {
        return sendFile(reply, index, request.method);
      }
      return jsonNotFound(request, reply);
    };

    app.get('/', serve);
    app.get('/*', serve);
  },
  { name: 'mosaic-static' }
);
