import { randomUUID } from 'node:crypto';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { BadRequestException, FactoryProvider } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import type { User } from '@prisma/client';
import { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Email from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { getUtcTimestamp, UserClaim } from './service';

export const NextAuthOptionsProvide = Symbol('NextAuthOptions');

export const NextAuthOptionsProvider: FactoryProvider<NextAuthOptions> = {
  provide: NextAuthOptionsProvide,
  useFactory(config: Config, prisma: PrismaService) {
    const prismaAdapter = PrismaAdapter(prisma);
    // createUser exists in the adapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const createUser = prismaAdapter.createUser!.bind(prismaAdapter);
    prismaAdapter.createUser = async data => {
      const userData = {
        name: data.name,
        email: data.email,
        avatarUrl: '',
        emailVerified: data.emailVerified,
      };
      if (data.email && !data.name) {
        userData.name = data.email.split('@')[0];
      }
      if (data.image) {
        userData.avatarUrl = data.image;
      }
      return createUser(userData);
    };
    // getUser exists in the adapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const getUser = prismaAdapter.getUser!.bind(prismaAdapter)!;
    prismaAdapter.getUser = async id => {
      const result = await getUser(id);
      if (result) {
        // @ts-expect-error Third part library type mismatch
        result.image = result.avatarUrl;
      }
      return result;
    };
    const nextAuthOptions: NextAuthOptions = {
      providers: [
        // @ts-expect-error esm interop issue
        Email.default({
          server: {
            host: config.auth.email.server,
            port: config.auth.email.port,
            auth: {
              user: config.auth.email.login,
              pass: config.auth.email.password,
            },
          },
          from: config.auth.email.sender,
        }),
      ],
      // @ts-expect-error Third part library type mismatch
      adapter: prismaAdapter,
      debug: !config.prod,
      session: {
        strategy: config.prod ? 'database' : 'jwt',
      },
      // @ts-expect-error Third part library type mismatch
      logger: console,
    };

    if (!config.prod) {
      nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Credentials.default({
          name: 'Password',
          credentials: {
            email: {
              label: 'Email',
              type: 'text',
              placeholder: 'torvalds@osdl.org',
            },
            password: { label: 'Password', type: 'password' },
          },
          async authorize(
            credentials: Record<'email' | 'password', string> | undefined,
            { body }: { body: Pick<User, 'email' | 'password' | 'avatarUrl'> }
          ) {
            if (!credentials) {
              return null;
            }
            const { password } = credentials;

            if (!body.password) {
              return null;
            }
            if (!verify(body.password, password)) {
              return null;
            }
            return body;
          },
        })
      );
    }

    if (config.auth.oauthProviders.github) {
      nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Github.default({
          clientId: config.auth.oauthProviders.github.clientId,
          clientSecret: config.auth.oauthProviders.github.clientSecret,
        })
      );
    }

    if (config.auth.oauthProviders.google) {
      nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Google.default({
          clientId: config.auth.oauthProviders.google.clientId,
          clientSecret: config.auth.oauthProviders.google.clientSecret,
          checks: 'nonce',
        })
      );
    }

    nextAuthOptions.jwt = {
      encode: async ({ token, maxAge }) => {
        if (!token?.email) {
          throw new BadRequestException('Missing email in jwt token');
        }
        const user = await prisma.user.findFirstOrThrow({
          where: {
            email: token.email,
          },
        });
        const now = getUtcTimestamp();
        return sign(
          {
            data: {
              id: user.id,
              name: user.name,
              email: user.email,
              picture: user.avatarUrl,
              createdAt: user.createdAt.toISOString(),
            },
            iat: now,
            exp: now + (maxAge ?? config.auth.accessTokenExpiresIn),
            iss: config.serverId,
            sub: user.id,
            aud: user.name,
            jti: randomUUID({
              disableEntropyCache: true,
            }),
          },
          config.auth.privateKey,
          {
            algorithm: Algorithm.ES256,
          }
        );
      },
      decode: async ({ token }) => {
        if (!token) {
          return null;
        }
        const { name, email, id, picture } = (
          await jwtVerify(token, config.auth.publicKey, {
            algorithms: [Algorithm.ES256],
            iss: [config.serverId],
            leeway: config.auth.leeway,
            requiredSpecClaims: ['exp', 'iat', 'iss', 'sub'],
          })
        ).data as Omit<UserClaim, 'avatarUrl'> & {
          picture: string | undefined;
        };
        return {
          name,
          email,
          picture,
          sub: id,
        };
      },
    };
    nextAuthOptions.secret ??= config.auth.nextAuthSecret;

    nextAuthOptions.callbacks = {
      session: async ({ session, user, token }) => {
        if (session.user) {
          if (user) {
            // @ts-expect-error Third part library type mismatch
            session.user.id = user.id;
            session.user.image = user.image;
          }
          if (token && token.picture) {
            session.user.image = token.picture;
          }
        }
        return session;
      },
    };
    return nextAuthOptions;
  },
  inject: [Config, PrismaService],
};
