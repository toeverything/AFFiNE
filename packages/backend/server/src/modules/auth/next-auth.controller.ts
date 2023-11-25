import { URLSearchParams } from 'node:url';

import {
  All,
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Next,
  NotFoundException,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { User } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { pick } from 'lodash-es';
import { nanoid } from 'nanoid';
import type { AuthAction, CookieOption, NextAuthOptions } from 'next-auth';
import { AuthHandler } from 'next-auth/core';

import { Config } from '../../config';
import { Metrics } from '../../metrics/metrics';
import { PrismaService } from '../../prisma/service';
import { SessionService } from '../../session';
import { AuthThrottlerGuard, Throttle } from '../../throttler';
import { NextAuthOptionsProvide } from './next-auth-options';
import { AuthService } from './service';

const BASE_URL = '/api/auth/';

const DEFAULT_SESSION_EXPIRE_DATE = 2592000 * 1000; // 30 days

@Controller(BASE_URL)
export class NextAuthController {
  private readonly callbackSession;

  private readonly logger = new Logger('NextAuthController');

  constructor(
    readonly config: Config,
    readonly prisma: PrismaService,
    private readonly authService: AuthService,
    @Inject(NextAuthOptionsProvide)
    private readonly nextAuthOptions: NextAuthOptions,
    private readonly metrics: Metrics,
    private readonly session: SessionService
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.callbackSession = nextAuthOptions.callbacks!.session;
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({
    default: {
      limit: 60,
      ttl: 60,
    },
  })
  @Get('/challenge')
  async getChallenge(@Res() res: Response) {
    const challenge = nanoid();
    const resource = nanoid();
    await this.session.set(challenge, resource, 5 * 60 * 1000);
    res.json({ challenge, resource });
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({
    default: {
      limit: 60,
      ttl: 60,
    },
  })
  @All('*')
  async auth(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, any>,
    @Next() next: NextFunction
  ) {
    if (req.path === '/api/auth/signin' && req.method === 'GET') {
      const query = req.query
        ? // @ts-expect-error req.query is satisfy with the Record<string, any>
          `?${new URLSearchParams(req.query).toString()}`
        : '';
      res.redirect(`/signin${query}`);
      return;
    }
    this.metrics.authCounter(1, {});
    const [action, providerId] = req.url // start with request url
      .slice(BASE_URL.length) // make relative to baseUrl
      .replace(/\?.*/, '') // remove query part, use only path part
      .split('/') as [AuthAction, string]; // as array of strings;

    const credentialsSignIn =
      req.method === 'POST' && providerId === 'credentials';
    let userId: string | undefined;
    if (credentialsSignIn) {
      const { email } = req.body;
      if (email) {
        const user = await this.prisma.user.findFirst({
          where: {
            email,
          },
        });
        if (!user) {
          req.statusCode = 401;
          req.statusMessage = 'User not found';
          req.body = null;
          throw new NotFoundException(`User not found`);
        } else {
          userId = user.id;
          req.body = {
            ...req.body,
            name: user.name,
            email: user.email,
            image: user.avatarUrl,
            hashedPassword: user.password,
          };
        }
      }
    }
    const options = this.nextAuthOptions;
    if (req.method === 'POST' && action === 'session') {
      if (typeof req.body !== 'object' || typeof req.body.data !== 'object') {
        this.metrics.authFailCounter(1, { reason: 'invalid_session_data' });
        throw new BadRequestException(`Invalid new session data`);
      }
      const user = await this.updateSession(req, req.body.data);
      // callbacks.session existed
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      options.callbacks!.session = ({ session }) => {
        return {
          user: {
            ...pick(user, 'id', 'name', 'email'),
            image: user.avatarUrl,
            hasPassword: !!user.password,
          },
          expires: session.expires,
        };
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      options.callbacks!.session = this.callbackSession;
    }

    if (
      this.config.auth.captcha.enable &&
      req.method === 'POST' &&
      action === 'signin' &&
      // TODO: add credentials support in frontend
      ['email'].includes(providerId)
    ) {
      const isVerified = await this.verifyChallenge(req, res);
      if (!isVerified) return;
    }

    const { status, headers, body, redirect, cookies } = await AuthHandler({
      req: {
        body: req.body,
        query: query,
        method: req.method,
        action,
        providerId,
        error: query.error ?? providerId,
        cookies: req.cookies,
      },
      options,
    });

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

    let nextAuthTokenCookie: (CookieOption & { value: string }) | undefined;
    const cookiePrefix = this.config.node.prod ? '__Secure-' : '';
    const sessionCookieName = `${cookiePrefix}next-auth.session-token`;
    // next-auth credentials login only support JWT strategy
    // https://next-auth.js.org/configuration/providers/credentials
    // let's store the session token in the database
    if (
      credentialsSignIn &&
      (nextAuthTokenCookie = cookies?.find(
        ({ name }) => name === sessionCookieName
      ))
    ) {
      const cookieExpires = new Date();
      cookieExpires.setTime(
        cookieExpires.getTime() + DEFAULT_SESSION_EXPIRE_DATE
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.nextAuthOptions.adapter!.createSession!({
        sessionToken: nextAuthTokenCookie.value,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        userId: userId!,
        expires: cookieExpires,
      });
    }

    if (redirect?.endsWith('api/auth/error?error=AccessDenied')) {
      this.logger.log(`Early access redirect headers: ${req.headers}`);
      this.metrics.authFailCounter(1, {
        reason: 'no_early_access_permission',
      });
      if (
        !req.headers?.referer ||
        checkUrlOrigin(req.headers.referer, 'https://accounts.google.com')
      ) {
        res.redirect('https://community.affine.pro/c/insider-general/');
      } else {
        res.status(403);
        res.json({
          url: 'https://community.affine.pro/c/insider-general/',
          error: `You don't have early access permission`,
        });
      }
      return;
    }

    if (status) {
      res.status(status);
    }

    if (redirect) {
      if (providerId === 'credentials') {
        res.send(JSON.stringify({ ok: true, url: redirect }));
      } else if (
        action === 'callback' ||
        action === 'error' ||
        (providerId !== 'credentials' &&
          // login in the next-auth page, /api/auth/signin, auto redirect.
          // otherwise, return the json value to allow frontend to handle the redirect.
          req.headers?.referer?.includes?.('/api/auth/signin'))
      ) {
        res.redirect(redirect);
      } else {
        res.json({ url: redirect });
      }
    } else if (typeof body === 'string') {
      res.send(body);
    } else if (body && typeof body === 'object') {
      res.json(body);
    } else {
      next();
    }
  }

  private async updateSession(
    req: Request,
    newSession: Partial<Omit<User, 'id'>> & { oldPassword?: string }
  ): Promise<User> {
    const { name, email, password, oldPassword } = newSession;
    if (!name && !email && !password) {
      throw new BadRequestException(`Invalid new session data`);
    }
    if (password) {
      const user = await this.verifyUserFromRequest(req);
      const { password: userPassword } = user;
      if (!oldPassword) {
        if (userPassword) {
          throw new BadRequestException(
            `Old password is required to update password`
          );
        }
      } else {
        if (!userPassword) {
          throw new BadRequestException(`No existed password`);
        }
        if (await verify(userPassword, oldPassword)) {
          await this.prisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              ...pick(newSession, 'email', 'name'),
              password: await hash(password),
            },
          });
        }
      }
      return user;
    } else {
      const user = await this.verifyUserFromRequest(req);
      return this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: pick(newSession, 'name', 'email'),
      });
    }
  }

  private async verifyChallenge(req: Request, res: Response): Promise<boolean> {
    const challenge = req.query?.challenge;
    if (typeof challenge === 'string' && challenge) {
      const resource = await this.session.get(challenge);

      if (!resource) {
        this.rejectResponse(res, 'Invalid Challenge');
        return false;
      }

      const isChallengeVerified =
        await this.authService.verifyChallengeResponse(
          req.query?.token,
          resource
        );

      this.logger.debug(
        `Challenge: ${challenge}, Resource: ${resource}, Response: ${req.query?.token}, isChallengeVerified: ${isChallengeVerified}`
      );

      if (!isChallengeVerified) {
        this.rejectResponse(res, 'Invalid Challenge Response');
        return false;
      }
    } else {
      const isTokenVerified = await this.authService.verifyCaptchaToken(
        req.query?.token,
        req.headers['CF-Connecting-IP'] as string
      );

      if (!isTokenVerified) {
        this.rejectResponse(res, 'Invalid Captcha Response');
        return false;
      }
    }
    return true;
  }

  private async verifyUserFromRequest(req: Request): Promise<User> {
    const token = req.headers.authorization;
    if (!token) {
      const session = await AuthHandler({
        req: {
          cookies: req.cookies,
          action: 'session',
          method: 'GET',
          headers: req.headers,
        },
        options: this.nextAuthOptions,
      });

      const { body } = session;
      // @ts-expect-error check if body.user exists
      if (body && body.user && body.user.id) {
        const user = await this.prisma.user.findUnique({
          where: {
            // @ts-expect-error body.user.id exists
            id: body.user.id,
          },
        });
        if (user) {
          return user;
        }
      }
    } else {
      const [type, jwt] = token.split(' ') ?? [];

      if (type === 'Bearer') {
        const claims = await this.authService.verify(jwt);
        const user = await this.prisma.user.findUnique({
          where: { id: claims.id },
        });
        if (user) {
          return user;
        }
      }
    }
    throw new BadRequestException(`User not found`);
  }

  rejectResponse(res: Response, error: string, status = 400) {
    res.status(status);
    res.json({
      url: `${this.config.baseUrl}/api/auth/error?${new URLSearchParams({
        error,
      }).toString()}`,
      error,
    });
  }
}

const checkUrlOrigin = (url: string, origin: string) => {
  try {
    return new URL(url).origin === origin;
  } catch (e) {
    return false;
  }
};
