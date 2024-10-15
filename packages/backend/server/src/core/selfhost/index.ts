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
    // in command line mode
    if (!this.adapterHost.httpAdapter) {
      return;
    }

    const app = this.adapterHost.httpAdapter.getInstance<Application>();

    // web => {
    //   affine: 'static/index.html',
    //   selfhost: 'static/selfhost.html'
    // }
    // admin => {
    //   affine: 'static/admin/index.html',
    //   selfhost: 'static/admin/selfhost.html'
    // }
    // mobile => {
    //   affine: 'static/mobile/index.html',
    //   selfhost: 'static/mobile/selfhost.html'
    // }
    this.serveStatic(app, '/admin');
    this.serveStatic(app, '/mobile');
    this.serveStatic(app, '/');
  }

  serveStatic(app: Application, baseRoute: string) {
    // for example, '/affine' in host [//host.com/affine]
    const basePath = this.config.server.path;
    const staticPath = join(this.config.projectRoot, 'static');

    // do not allow '/index.html' url, redirect to '/'
    const route = basePath + baseRoute;
    app.get(route + '/index.html', (_req, res) => {
      return res.redirect(route);
    });

    // serve all static files
    app.use(
      route,
      serveStatic(join(staticPath, baseRoute), {
        redirect: false,
        index: false,
      })
    );

    // fallback all unknown links to root path
    app.use([route, route + '/*'], this.check.use, (_req, res) => {
      res.sendFile(
        join(
          staticPath,
          this.config.isSelfhosted ? 'selfhost.html' : 'index.html'
        )
      );
    });
  }
}
