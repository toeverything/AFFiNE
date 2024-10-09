import { join } from 'node:path';

import {
  Injectable,
  Module,
  NestMiddleware,
  OnModuleInit,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application, Request, Response } from 'express';
import { static as serveStatic } from 'express';

import { Config } from '../../fundamentals';
import { AuthModule } from '../auth';
import { ServerConfigModule, ServerService } from '../config';
import { UserModule } from '../user';
import { CustomSetupController } from './controller';

@Injectable()
export class SetupMiddleware implements NestMiddleware {
  constructor(private readonly server: ServerService) {}

  use = (req: Request, res: Response, next: (error?: Error | any) => void) => {
    // never throw
    this.server
      .initialized()
      .then(initialized => {
        // Redirect to setup page if not initialized
        if (!initialized && req.path !== '/admin/setup') {
          res.redirect('/admin/setup');
          return;
        }

        // redirect to admin page if initialized
        if (initialized && req.path === '/admin/setup') {
          res.redirect('/admin');
          return;
        }

        next();
      })
      .catch(() => {
        next();
      });
  };
}

@Module({
  imports: [AuthModule, UserModule, ServerConfigModule],
  providers: [SetupMiddleware],
  controllers: [CustomSetupController],
})
export class SelfhostModule implements OnModuleInit {
  constructor(
    private readonly config: Config,
    private readonly adapterHost: HttpAdapterHost,
    private readonly check: SetupMiddleware
  ) {}

  onModuleInit() {
    const staticPath = join(this.config.projectRoot, 'static');
    // in command line mode
    if (!this.adapterHost.httpAdapter) {
      return;
    }

    const app = this.adapterHost.httpAdapter.getInstance<Application>();
    const basePath = this.config.server.path;

    app.get(basePath + '/admin/index.html', (_req, res) => {
      res.redirect(basePath + '/admin');
    });

    // selfhost static file location
    // web => 'static/selfhost'
    // admin => 'static/admin/selfhost'
    // mobile => 'static/mobile/selfhost'
    app.use(
      basePath + '/admin',
      serveStatic(join(staticPath, 'admin', 'selfhost'), {
        redirect: false,
        index: false,
      })
    );
    app.use(
      basePath + '/mobile',
      serveStatic(join(staticPath, 'mobile', 'selfhost'), {
        redirect: false,
        index: false,
      })
    );

    app.get(
      [basePath + '/admin', basePath + '/admin/*'],
      this.check.use,
      (_req, res) => {
        res.sendFile(join(staticPath, 'admin', 'selfhost', 'index.html'));
      }
    );

    app.get(basePath + '/index.html', (_req, res) => {
      res.redirect(basePath);
    });

    app.use(
      basePath,
      serveStatic(join(staticPath, 'selfhost'), {
        redirect: false,
        index: false,
      })
    );

    app.get('*', this.check.use, (_req, res) => {
      res.sendFile(join(staticPath, 'selfhost', 'index.html'));
    });
  }
}
