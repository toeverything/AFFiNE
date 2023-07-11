import { All, Controller, Inject, Next, Query, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthAction, NextAuthOptions } from 'next-auth';
import { AuthHandler } from 'next-auth/core';

import { Config } from '../../config';
import { PrismaService } from '../../prisma/service';
import { NextAuthOptionsProvide } from './next-auth-options';

const BASE_URL = '/api/auth/';

@Controller(BASE_URL)
export class NextAuthController {
  constructor(
    readonly config: Config,
    readonly prisma: PrismaService,
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
}
