import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ServerService } from '../config';

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
