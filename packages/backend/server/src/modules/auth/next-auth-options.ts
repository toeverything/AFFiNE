import { PrismaAdapter } from '@auth/prisma-adapter';
import { FactoryProvider, Logger } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { assign, omit } from 'lodash-es';
import { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Email from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { SessionService } from '../../session';
import { NewFeaturesKind } from '../users/types';
import { isStaff } from '../users/utils';
import { MailService } from './mailer';
import {
  decode,
  encode,
  sendVerificationRequest,
  SendVerificationRequestParams,
} from './utils';

export const NextAuthOptionsProvide = Symbol('NextAuthOptions');

const TrustedProviders = ['google'];

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
    // linkAccount exists in the adapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const linkAccount = prismaAdapter.linkAccount!.bind(prismaAdapter);
    prismaAdapter.linkAccount = async account => {
      // google account must be a verified email
      if (TrustedProviders.includes(account.provider)) {
        await prisma.user.update({
          where: {
            id: account.userId,
          },
          data: {
            emailVerified: new Date(),
          },
        });
      }
      return linkAccount(account) as Promise<void>;
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
          sendVerificationRequest: (params: SendVerificationRequestParams) =>
            sendVerificationRequest(config, logger, mailer, session, params),
        }),
      ],
      adapter: prismaAdapter,
      debug: !config.node.prod,
      session: {
        strategy: 'database',
      },
      logger: {
        debug(code, metadata) {
          logger.debug(`${code}: ${JSON.stringify(metadata)}`);
        },
        error(code, metadata) {
          if (metadata instanceof Error) {
            // @ts-expect-error assign code to error
            metadata.code = code;
            logger.error(metadata);
          } else if (metadata.error instanceof Error) {
            assign(metadata.error, omit(metadata, 'error'), { code });
            logger.error(metadata.error);
          }
        },
        warn(code) {
          logger.warn(code);
        },
      },
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
          authorization: {
            params: { scope: 'openid email profile', prompt: 'select_account' },
          },
        })
      );
    }

    nextAuthOptions.jwt = {
      encode: async ({ token, maxAge }) =>
        encode(config, prisma, token, maxAge),
      decode: async ({ token }) => decode(config, token),
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
