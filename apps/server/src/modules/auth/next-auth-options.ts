import { randomUUID } from 'node:crypto';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { BadRequestException, FactoryProvider, Logger } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import { nanoid } from 'nanoid';
import { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Email, {
  type SendVerificationRequestParams,
} from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { SessionService } from '../../session';
import { NewFeaturesKind } from '../users/types';
import { isStaff } from '../users/utils';
import { MailService } from './mailer';
import { getUtcTimestamp, UserClaim } from './service';

export const NextAuthOptionsProvide = Symbol('NextAuthOptions');

export const NextAuthOptionsProvider: FactoryProvider<NextAuthOptions> = {
  provide: NextAuthOptionsProvide,
  useFactory(
    config: Config,
    prisma: PrismaService,
    mailer: MailService,
    session: SessionService
  ) {
    const logger = new Logger('NextAuth');
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
        // @ts-expect-error Third part library type mismatch
        result.hasPassword = Boolean(result.password);
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
          async sendVerificationRequest(params: SendVerificationRequestParams) {
            const { identifier, url, provider } = params;
            const urlWithToken = new URL(url);
            const callbackUrl =
              urlWithToken.searchParams.get('callbackUrl') || '';
            if (!callbackUrl) {
              throw new Error('callbackUrl is not set');
            } else {
              const newCallbackUrl = new URL(callbackUrl, config.origin);

              const token = nanoid();
              await session.set(token, identifier);
              newCallbackUrl.searchParams.set('token', token);

              urlWithToken.searchParams.set(
                'callbackUrl',
                newCallbackUrl.toString()
              );
            }

            const result = await mailer.sendSignInEmail(
              urlWithToken.toString(),
              {
                to: identifier,
                from: provider.from,
              }
            );
            logger.log(
              `send verification email success: ${result.accepted.join(', ')}`
            );

            const failed = result.rejected
              .concat(result.pending)
              .filter(Boolean);
            if (failed.length) {
              throw new Error(`Email (${failed.join(', ')}) could not be sent`);
            }
          },
        }),
      ],
      // @ts-expect-error Third part library type mismatch
      adapter: prismaAdapter,
      debug: !config.node.prod,
      session: {
        strategy: 'jwt',
      },
      // @ts-expect-error Third part library type mismatch
      logger: console,
    };

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
          credentials:
            | Record<'email' | 'password' | 'hashedPassword', string>
            | undefined
        ) {
          if (!credentials) {
            return null;
          }
          const { password, hashedPassword } = credentials;
          if (!password || !hashedPassword) {
            return null;
          }
          if (!(await verify(hashedPassword, password))) {
            return null;
          }
          return credentials;
        },
      })
    );

    if (config.auth.oauthProviders.github) {
      nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Github.default({
          clientId: config.auth.oauthProviders.github.clientId,
          clientSecret: config.auth.oauthProviders.github.clientSecret,
          allowDangerousEmailAccountLinking: true,
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
          allowDangerousEmailAccountLinking: true,
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
              emailVerified: user.emailVerified?.toISOString(),
              picture: user.avatarUrl,
              createdAt: user.createdAt.toISOString(),
              hasPassword: Boolean(user.password),
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
        const { name, email, emailVerified, id, picture, hasPassword } = (
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
          emailVerified,
          picture,
          sub: id,
          id,
          hasPassword,
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
            // @ts-expect-error Third part library type mismatch
            session.user.image = user.image ?? user.avatarUrl;
            // @ts-expect-error Third part library type mismatch
            session.user.emailVerified = user.emailVerified;
            // @ts-expect-error Third part library type mismatch
            session.user.hasPassword = Boolean(user.password);
          } else {
            // technically the sub should be the same as id
            // @ts-expect-error Third part library type mismatch
            session.user.id = token.sub;
            // @ts-expect-error Third part library type mismatch
            session.user.emailVerified = token.emailVerified;
            // @ts-expect-error Third part library type mismatch
            session.user.hasPassword = token.hasPassword;
          }
          if (token && token.picture) {
            session.user.image = token.picture;
          }
        }
        return session;
      },
      signIn: async ({ profile, user }) => {
        if (!config.featureFlags.earlyAccessPreview) {
          return true;
        }
        const email = profile?.email ?? user.email;
        if (email) {
          if (isStaff(email)) {
            return true;
          }
          return prisma.newFeaturesWaitingList
            .findUnique({
              where: {
                email,
                type: NewFeaturesKind.EarlyAccess,
              },
            })
            .then(user => !!user)
            .catch(() => false);
        }
        return false;
      },
      redirect({ url }) {
        return url;
      },
    };
    return nextAuthOptions;
  },
  inject: [Config, PrismaService, MailService, SessionService],
};
