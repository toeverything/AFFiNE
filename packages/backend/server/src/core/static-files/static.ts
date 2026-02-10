import { join } from 'node:path';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application, Request, Response } from 'express';
import { static as serveStatic } from 'express';

import { Config } from '../../base';
import { isMobileRequest } from '../utils/user-agent';

const staticPathRegex = /^\/(_plugin|assets|imgs|js|plugins|static)\//;

@Injectable()
export class StaticFilesResolver implements OnModuleInit {
  constructor(
    private readonly config: Config,
    private readonly adapterHost: HttpAdapterHost
  ) {}

  onModuleInit() {
    if (!this.adapterHost.httpAdapter) {
      return;
    }

    const app = this.adapterHost.httpAdapter.getInstance<Application>();
    const basePath = this.config.server.path;
    const rootPath = basePath || '/';
    const staticPath = join(env.projectRoot, 'static');
    const adminPath = join(staticPath, 'admin');
    const mobilePath = env.namespaces.canary
      ? join(staticPath, 'mobile')
      : staticPath;

    const staticAsset = serveStatic(staticPath, {
      redirect: false,
      index: false,
      fallthrough: true,
    });
    const mobileAsset = serveStatic(mobilePath, {
      redirect: false,
      index: false,
      fallthrough: true,
    });
    const staticAssetStrict = serveStatic(staticPath, {
      redirect: false,
      index: false,
      fallthrough: false,
    });
    const mobileAssetStrict = serveStatic(mobilePath, {
      redirect: false,
      index: false,
      fallthrough: false,
    });
    const adminAsset = serveStatic(adminPath, {
      redirect: false,
      index: false,
      fallthrough: true,
    });

    const routeByUA = (
      req: Request,
      res: Response,
      next: (err?: unknown) => void,
      strict = false
    ) => {
      const isMobile = isMobileRequest(req.headers);
      if (strict) {
        return isMobile
          ? mobileAssetStrict(req, res, next)
          : staticAssetStrict(req, res, next);
      }
      return isMobile
        ? mobileAsset(req, res, next)
        : staticAsset(req, res, next);
    };

    // /admin
    app.use(basePath + '/admin', adminAsset);
    app.get([basePath + '/admin', basePath + '/admin/*path'], (_req, res) => {
      res.sendFile(join(adminPath, 'index.html'));
    });

    // /_plugin|/assets|/imgs|/js|/plugins|/static
    app.use(rootPath, (req, res, next) => {
      if (!staticPathRegex.test(req.path)) {
        next();
        return;
      }
      routeByUA(req, res, next, true);
    });

    // /
    app.use(rootPath, (req, res, next) => {
      if (req.path.startsWith('/admin')) {
        next();
        return;
      }

      res.setHeader(
        'Cache-Control',
        'private, no-cache, no-store, max-age=0, must-revalidate'
      );
      routeByUA(req, res, next, false);
    });

    app.get(
      [basePath || '/', basePath + '/*path'],
      (req: Request, res: Response) => {
        if (req.path.startsWith('/admin')) {
          res.status(404).end();
          return;
        }

        const root = isMobileRequest(req.headers) ? mobilePath : staticPath;
        res.sendFile(join(root, 'index.html'));
      }
    );
  }
}
