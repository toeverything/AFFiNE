import type { FastifyRequest } from 'fastify';

import type { AuthService } from '../../application/auth-service.js';
import type { ShareService } from '../../application/share-service.js';
import type { User } from '../../domain/identity.js';
import { toGraphQLError } from './graphql-error.js';

export const shareTypeDefs = /* GraphQL */ `
  enum PublicDocMode {
    Page
    Edgeless
  }

  type DocType {
    id: String!
    workspaceId: String!
    mode: PublicDocMode!
    public: Boolean!
  }

  extend type WorkspaceType {
    publicDocs: [DocType!]!
  }

  extend type Mutation {
    publishDoc(
      workspaceId: String!
      docId: String!
      mode: PublicDocMode
    ): DocType!
    revokePublicDoc(workspaceId: String!, docId: String!): DocType!
  }
`;

function gqlPublicDoc(doc: {
  workspaceId: string;
  docId: string;
  mode: string;
  public?: boolean;
}) {
  return {
    id: doc.docId,
    workspaceId: doc.workspaceId,
    mode: doc.mode,
    public: doc.public ?? true,
  };
}

export function shareResolvers(opts: {
  auth: AuthService;
  shares: ShareService;
  requestOf: (ctx: { request?: FastifyRequest }) => FastifyRequest | undefined;
}) {
  const userOf = async (ctx: { request?: FastifyRequest }): Promise<User> =>
    opts.auth.requireUser(opts.requestOf(ctx)?.authSession ?? null);

  return {
    WorkspaceType: {
      publicDocs: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const docs = await opts.shares.list(user, parent.id);
          return docs.map(doc => gqlPublicDoc(doc));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Mutation: {
      publishDoc: async (
        _root: unknown,
        args: { workspaceId: string; docId: string; mode?: string | null },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const doc = await opts.shares.publish(
            user,
            args.workspaceId,
            args.docId,
            args.mode
          );
          return gqlPublicDoc(doc);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      revokePublicDoc: async (
        _root: unknown,
        args: { workspaceId: string; docId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const doc = await opts.shares.revoke(
            user,
            args.workspaceId,
            args.docId
          );
          return gqlPublicDoc({ ...doc, public: false });
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
  };
}
