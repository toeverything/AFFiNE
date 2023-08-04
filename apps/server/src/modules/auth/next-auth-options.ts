import { randomUUID } from 'node:crypto';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { BadRequestException, FactoryProvider } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import type { User } from '@prisma/client';
import { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Email, {
  type SendVerificationRequestParams,
} from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { MailService } from './mailer';
import { getUtcTimestamp, UserClaim } from './service';

export const NextAuthOptionsProvide = Symbol('NextAuthOptions');

export const NextAuthOptionsProvider: FactoryProvider<NextAuthOptions> = {
  provide: NextAuthOptionsProvide,
  useFactory(config: Config, prisma: PrismaService, mailer: MailService) {
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
          async sendVerificationRequest(params: SendVerificationRequestParams) {
            const { identifier, url, provider } = params;
            const { host } = new URL(url);
            const result = await mailer.sendMail({
              to: identifier,
              from: provider.from,
              subject: `Sign in to ${host}`,
              text: text({ url, host }),
              html: html({ url, host }),
            });
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
            if (!body.password || !password) {
              return null;
            }
            if (!(await verify(body.password, password))) {
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
          id,
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
          } else {
            // technically the sub should be the same as id
            // @ts-expect-error Third part library type mismatch
            session.user.id = token.sub;
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
  inject: [Config, PrismaService, MailService],
};

/**
 * Email HTML body
 * Insert invisible space into domains from being turned into a hyperlink by email
 * clients like Outlook and Apple mail, as this is confusing because it seems
 * like they are supposed to click on it to sign in.
 *
 * @note We don't add the email address to avoid needing to escape it, if you do, remember to sanitize it!
 */
function html(params: { url: string; host: string }) {
  const { url, host } = params;

  const escapedHost = host.replace(/\./g, '&#8203;.');

  const brandColor = '#346df1';
  const buttonText = '#fff';

  const color = {
    background: '#f9f9f9',
    text: '#444',
    mainBackground: '#fff',
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText,
  };

  return `
<body style="background: ${color.background};">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        Sign in to <strong>${escapedHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${color.buttonBackground}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${color.buttonBorder}; display: inline-block; font-weight: bold;">Sign
                in</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        If you did not request this email you can safely ignore it.
      </td>
    </tr>
  </table>
</body>
`;
}

/** Email Text body (fallback for email clients that don't render HTML, e.g. feature phones) */
function text({ url, host }: { url: string; host: string }) {
  return `Sign in to ${host}\n${url}\n\n`;
}
