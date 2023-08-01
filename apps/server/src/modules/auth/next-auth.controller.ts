import {
  All,
  BadRequestException,
  Controller,
  Inject,
  Next,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { User } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { pick } from 'lodash-es';
import type { AuthAction, NextAuthOptions } from 'next-auth';
import { AuthHandler } from 'next-auth/core';

import { Config } from '../../config';
import { PrismaService } from '../../prisma/service';
import { NextAuthOptionsProvide } from './next-auth-options';
import { AuthService } from './service';

const BASE_URL = '/api/auth/';

@Controller(BASE_URL)
export class NextAuthController {
  constructor(
    readonly config: Config,
    readonly prisma: PrismaService,
    private readonly authService: AuthService,
    @Inject(NextAuthOptionsProvide)
    private readonly nextAuthOptions: NextAuthOptions
  ) {}

  @All('*')
  async auth(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, any>,
    @Next() next: NextFunction
  ) {
    const [action, providerId] = req.url // start with request url
      .slice(BASE_URL.length) // make relative to baseUrl
      .replace(/\?.*/, '') // remove query part, use only path part
      .split('/') as [AuthAction, string]; // as array of strings;
    if (providerId === 'credentials') {
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
          req.body = {
            ...req.body,
            name: user.name,
            email: user.email,
            password: user.password,
            image: user.avatarUrl,
          };
        }
      }
    }
    const options = this.nextAuthOptions;
    if (req.method === 'POST' && action === 'session') {
      if (typeof req.body !== 'object' || typeof req.body.data !== 'object') {
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
          },
          expires: session.expires,
        };
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      options.callbacks!.session = ({ session }) => session;
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
      if (action === 'signout') {
        res.send(JSON.stringify({ url: redirect }));
      } else {
        res.redirect(redirect);
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
      const user = await this.getUserFromRequest(req);
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
      const user = await this.getUserFromRequest(req);
      return this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: pick(newSession, 'name', 'email'),
      });
    }
  }

  private async getUserFromRequest(req: Request): Promise<User> {
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
}
