import { randomUUID } from 'node:crypto';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { BadRequestException, FactoryProvider, Logger } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Email, {
  type SendVerificationRequestParams,
} from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { NewFeaturesKind } from '../users/types';
import { MailService } from './mailer';
import { getUtcTimestamp, UserClaim } from './service';

export const NextAuthOptionsProvide = Symbol('NextAuthOptions');

function getSchemaFromCallbackUrl(origin: string, callbackUrl: string) {
  const { searchParams } = new URL(callbackUrl, origin);
  return searchParams.has('schema') ? searchParams.get('schema') : null;
}

function wrapUrlWithSchema(url: string, schema: string | null) {
  if (schema) {
    return `${schema}://open-url?${url}`;
  }
  return url;
}

export const NextAuthOptionsProvider: FactoryProvider<NextAuthOptions> = {
  provide: NextAuthOptionsProvide,
  useFactory(config: Config, prisma: PrismaService, mailer: MailService) {
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
            const { host, searchParams, origin } = new URL(url);
            const callbackUrl = searchParams.get('callbackUrl') || '';
            if (!callbackUrl) {
              throw new Error('callbackUrl is not set');
            }
            const schema = getSchemaFromCallbackUrl(origin, callbackUrl);
            const wrappedUrl = wrapUrlWithSchema(url, schema);
            // hack: check if link is opened via desktop
            const result = await mailer.sendMail({
              to: identifier,
              from: provider.from,
              subject: `Sign in to ${host}`,
              text: text({ url: wrappedUrl, host }),
              html: html({ url: wrappedUrl, host }),
            });
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
        strategy: config.node.prod ? 'database' : 'jwt',
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
        if (!config.affine.beta || !config.node.prod) {
          return true;
        }
        const email = profile?.email ?? user.email;
        if (email) {
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
  const { url } = params;

  return `
  <body style="background: #f6f7fb;overflow:hidden">
    <table
      width="100%"
      border="0"
      cellpadding="24px"
      style="
        background: #fff;
        max-width: 450px;
        margin: 32px auto 0 auto;
        border-radius: 16px 16px 0 0;
        box-shadow: 0px 0px 20px 0px rgba(66, 65, 73, 0.04);
      "
    >
      <tr>
        <td>
          <a href="https://affine.pro" target="_blank">
            <img
              src="https://cdn.affine.pro/mail/2023-8-9/affine-logo.png"
              alt="AFFiNE log"
              height="32px"
            />
          </a>
        </td>
      </tr>
      <tr>
        <td
          style="
            font-size: 20px;
            font-weight: 600;
            line-height: 28px;
            font-family: inter, Arial, Helvetica, sans-serif;
            color: #444;
            padding-top: 0;
          "
        >
          Verify your new email for AFFiNE
        </td>
      </tr>
      <tr>
        <td
          style="
            font-size: 15px;
            font-weight: 400;
            line-height: 24px;
            font-family: inter, Arial, Helvetica, sans-serif;
            color: #444;
            padding-top: 0;
          "
        >
          You recently requested to change the email address associated with your
          AFFiNe account. To complete this process, please click on the
          verification link below.
        </td>
      </tr>
      <tr>
        <td style="margin-left: 24px; padding-top: 0; padding-bottom: 64px">
          <table border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-radius: 8px" bgcolor="#1E96EB">
                <a
                  href="${url}"
                  target="_blank"
                  style="
                    font-size: 15px;
                    font-family: inter, Arial, Helvetica, sans-serif;
                    font-weight: 600;
                    line-height: 24px;
                    color: #fff;
                    text-decoration: none;
                    border-radius: 8px;
                    padding: 8px 18px;
                    border: 1px solid #1e96eb;
                    display: inline-block;
                    font-weight: bold;
                  "
                  >Verify your new email address</a
                >
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <table
      width="100%"
      border="0"
      style="
        background: #fafafa;
        max-width: 450px;
        margin: 0 auto 32px auto;
        border-radius: 0 0 16px 16px;
        box-shadow: 0px 0px 20px 0px rgba(66, 65, 73, 0.04);
        padding: 20px;
      "
    >
      <tr align="center">
        <td>
          <table cellpadding="0">
            <tr>
              <td style="padding: 0 10px">
                <a href="https://github.com/toeverything/AFFiNE" target="_blank"
                  ><img
                    src="https://cdn.affine.pro/mail/2023-8-9/Github.png"
                    alt="AFFiNE github link"
                    height="16px"
                /></a>
              </td>
              <td style="padding: 0 10px">
                <a href="https://twitter.com/AffineOfficial" target="_blank">
                  <img
                    src="https://cdn.affine.pro/mail/2023-8-9/Twitter.png"
                    alt="AFFiNE twitter link"
                    height="16px"
                  />
                </a>
              </td>
              <td style="padding: 0 10px">
                <a href="https://discord.gg/Arn7TqJBvG" target="_blank"
                  ><img
                    src="https://cdn.affine.pro/mail/2023-8-9/Discord.png"
                    alt="AFFiNE discord link"
                    height="16px"
                /></a>
              </td>
              <td style="padding: 0 10px">
                <a href="https://www.youtube.com/@affinepro" target="_blank"
                  ><img
                    src="https://cdn.affine.pro/mail/2023-8-9/Youtube.png"
                    alt="AFFiNE youtube link"
                    height="16px"
                /></a>
              </td>
              <td style="padding: 0 10px">
                <a href="https://t.me/affineworkos" target="_blank"
                  ><img
                    src="https://cdn.affine.pro/mail/2023-8-9/Telegram.png"
                    alt="AFFiNE telegram link"
                    height="16px"
                /></a>
              </td>
              <td style="padding: 0 10px">
                <a href="https://www.reddit.com/r/Affine/" target="_blank"
                  ><img
                    src="https://cdn.affine.pro/mail/2023-8-9/Reddit.png"
                    alt="AFFiNE reddit link"
                    height="16px"
                /></a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr align="center">
        <td
          style="
            font-size: 12px;
            font-weight: 400;
            line-height: 20px;
            font-family: inter, Arial, Helvetica, sans-serif;
            color: #8e8d91;
            padding-top: 8px;
          "
        >
          One hyper-fused platform for wildly creative minds
        </td>
      </tr>
      <tr align="center">
        <td
          style="
            font-size: 12px;
            font-weight: 400;
            line-height: 20px;
            font-family: inter, Arial, Helvetica, sans-serif;
            color: #8e8d91;
            padding-top: 8px;
          "
        >
          Copyright<img
            src="https://cdn.affine.pro/mail/2023-8-9/copyright.png"
            alt="copyright"
            height="14px"
            style="vertical-align: middle; margin: 0 4px"
          />2023 Toeverything
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
