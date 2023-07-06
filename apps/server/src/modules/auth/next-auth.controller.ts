import { randomUUID } from 'node:crypto';

import { PrismaAdapter } from '@auth/prisma-adapter';
import {
  All,
  BadRequestException,
  Controller,
  Next,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { AuthAction, AuthOptions } from 'next-auth';
import { AuthHandler } from 'next-auth/core';
import Email from 'next-auth/providers/email';
import Github from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { Config } from '../../config';
import { PrismaService } from '../../prisma/service';
import { getUtcTimestamp, type UserClaim } from './service';

const BASE_URL = '/api/auth/';

@Controller(BASE_URL)
export class NextAuthController {
  private readonly nextAuthOptions: AuthOptions;

  constructor(
    readonly config: Config,
    readonly prisma: PrismaService
  ) {
    const prismaAdapter = PrismaAdapter(prisma);
    // createUser exists in the adapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const createUser = prismaAdapter.createUser!.bind(prismaAdapter);
    prismaAdapter.createUser = async data => {
      if (data.email && !data.name) {
        data.name = data.email.split('@')[0];
      }
      return createUser(data);
    };
    this.nextAuthOptions = {
      providers: [
        // @ts-expect-error esm interop issue
        Email.default({
          server: {
            host: config.auth.email.server,
            port: config.auth.email.port,
            auth: {
              user: config.auth.email.sender,
              pass: config.auth.email.password,
            },
          },
          from: `AFFiNE <no-reply@toeverything.info>`,
        }),
      ],
      // @ts-expect-error Third part library type mismatch
      adapter: prismaAdapter,
      debug: !config.prod,
    };

    if (config.auth.oauthProviders.github) {
      this.nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Github.default({
          clientId: config.auth.oauthProviders.github.clientId,
          clientSecret: config.auth.oauthProviders.github.clientSecret,
        })
      );
    }

    if (config.auth.oauthProviders.google) {
      this.nextAuthOptions.providers.push(
        // @ts-expect-error esm interop issue
        Google.default({
          clientId: config.auth.oauthProviders.google.clientId,
          clientSecret: config.auth.oauthProviders.google.clientSecret,
        })
      );
    }

    this.nextAuthOptions.jwt = {
      encode: async ({ token, maxAge }) => {
        if (!token?.email) {
          throw new BadRequestException('Missing email in jwt token');
        }
        const user = await this.prisma.user.findFirstOrThrow({
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
              createdAt: user.createdAt.toISOString(),
            },
            iat: now,
            exp: now + (maxAge ?? config.auth.accessTokenExpiresIn),
            iss: this.config.serverId,
            sub: user.id,
            aud: user.name,
            jti: randomUUID({
              disableEntropyCache: true,
            }),
          },
          this.config.auth.privateKey,
          {
            algorithm: Algorithm.ES256,
          }
        );
      },
      decode: async ({ token }) => {
        if (!token) {
          return null;
        }
        const { name, email, id } = (
          await jwtVerify(token, this.config.auth.publicKey, {
            algorithms: [Algorithm.ES256],
            iss: [this.config.serverId],
            leeway: this.config.auth.leeway,
            requiredSpecClaims: ['exp', 'iat', 'iss', 'sub'],
          })
        ).data as UserClaim;
        return {
          name,
          email,
          sub: id,
        };
      },
    };
    this.nextAuthOptions.secret ??= config.auth.nextAuthSecret;
  }

  @All('*')
  async auth(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, any>,
    @Next() next: NextFunction
  ) {
    const nextauth = req.url // start with request url
      .slice(BASE_URL.length) // make relative to baseUrl
      .replace(/\?.*/, '') // remove query part, use only path part
      .split('/') as AuthAction[]; // as array of strings;
    const { status, headers, body, redirect, cookies } = await AuthHandler({
      req: {
        body: req.body,
        query: query,
        method: req.method,
        action: nextauth[0],
        providerId: nextauth[1],
        error: query.error ?? nextauth[1],
        cookies: req.cookies,
      },
      options: this.nextAuthOptions,
    });
    if (status) {
      res.status(status);
    }
    if (headers) {
      for (const { key, value } of headers) {
        res.setHeader(key, value);
      }
    }
    if (cookies) {
      for (const cookie of cookies) {
        res.cookie(cookie.name, cookie.value, cookie.options);
      }
    }
    if (redirect) {
      res.redirect(redirect);
    } else if (typeof body === 'string') {
      res.send(body);
    } else if (body && typeof body === 'object') {
      res.json(body);
    } else {
      next();
    }
  }
}
