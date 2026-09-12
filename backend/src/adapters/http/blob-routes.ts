import fp from 'fastify-plugin';

import type { AuthService } from '../../application/auth-service.js';
import type { BlobService } from '../../application/blob-service.js';

function asBuffer(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }
  if (typeof value === 'string') {
    return Uint8Array.from(Buffer.from(value, 'binary'));
  }
  throw new Error('Expected binary body.');
}

export const blobRoutes = fp<{
  auth: AuthService;
  blobs: BlobService;
}>(
  async (app, opts) => {
    app.addContentTypeParser(
      ['application/octet-stream', 'application/x-www-form-urlencoded'],
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      }
    );

    app.get('/api/workspaces/:id/blobs/v1/:key', async (request, reply) => {
      const user = await opts.auth.requireUser(request.authSession);
      const { id, key } = request.params as { id: string; key: string };
      const { record, bytes } = await opts.blobs.get(user, id, key);
      return reply
        .header('content-type', record.mime)
        .header('last-modified', record.createdAt.toUTCString())
        .header('cache-control', 'private, no-store')
        .send(Buffer.from(bytes));
    });

    app.get('/api/workspaces/:id/blob-manifest/v1', async request => {
      const user = await opts.auth.requireUser(request.authSession);
      const { id } = request.params as { id: string };
      const query = request.query as {
        sourceType?: string;
        docId?: string;
        timestampMs?: string;
      };
      return opts.blobs.manifest(user, id, query);
    });

    app.get('/api/workspaces/:id/readable-blob-manifest/v1', async request => {
      const user = await opts.auth.requireUser(request.authSession);
      const { id } = request.params as { id: string };
      const query = request.query as { limit?: string; cursor?: string };
      return opts.blobs.readableManifest(user, id, query);
    });

    app.put(
      '/api/blob-uploads/:token',
      { bodyLimit: 100 * 1024 * 1024 },
      async (request, reply) => {
        const { token } = request.params as { token: string };
        const { etag } = await opts.blobs.putUpload(
          token,
          asBuffer(request.body)
        );
        return reply.header('etag', etag).status(200).send({ ok: true });
      }
    );
  },
  { name: 'mosaic-blob-routes' }
);
