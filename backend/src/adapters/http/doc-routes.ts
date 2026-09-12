import fp from 'fastify-plugin';

import { errors } from '../../domain/errors.js';
import type { AuthService } from '../../application/auth-service.js';
import type { DocService } from '../../application/doc-service.js';
import type { ShareService } from '../../application/share-service.js';

export const docRoutes = fp<{
  auth: AuthService;
  docs: DocService;
  shares: ShareService;
}>(
  async (app, opts) => {
    app.get('/api/workspaces/:id/docs/:docId', async (request, reply) => {
      const user = await opts.auth.requireUser(request.authSession);
      const { id, docId } = request.params as { id: string; docId: string };
      const bytes = await opts.docs.snapshotBytes(user, 'workspace', id, docId);
      return reply
        .header('content-type', 'application/octet-stream')
        .send(Buffer.from(bytes));
    });

    app.route({
      method: ['GET', 'HEAD'],
      url: '/api/workspaces/:id/public-docs/:docId',
      handler: async (request, reply) => {
        const { id, docId } = request.params as { id: string; docId: string };
        const published = await opts.shares.publicDoc(id, docId);
        const mode = published.mode === 'Edgeless' ? 'edgeless' : 'page';
        void reply.header('publish-mode', mode);
        if (request.method === 'HEAD') {
          return reply.status(200).send();
        }
        const bytes = await opts.docs.publicSnapshotBytes(id, docId);
        return reply
          .header('content-type', 'application/octet-stream')
          .send(Buffer.from(bytes));
      },
    });

    app.get(
      '/api/workspaces/:id/docs/:docId/histories/:ts',
      async (request, reply) => {
        const user = await opts.auth.requireUser(request.authSession);
        const { id, docId, ts } = request.params as {
          id: string;
          docId: string;
          ts: string;
        };
        const timestamp = Number(ts);
        if (!Number.isFinite(timestamp)) {
          throw errors.badRequest('Invalid history timestamp.');
        }
        const bytes = await opts.docs.historyBytes(user, id, docId, timestamp);
        return reply
          .header('content-type', 'application/octet-stream')
          .send(Buffer.from(bytes));
      }
    );
  },
  { name: 'mosaic-doc-routes' }
);
