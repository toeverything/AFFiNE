import { join } from 'node:path';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application, Request, Response } from 'express';
import { static as serveStatic } from 'express';

import { Config } from '../../base';

const mobileRegexPrimary =
  /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;
const mobileRegexLegacy =
  /^(1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-)/i;

function isMobileUA(ua: string | undefined) {
  if (!ua) {
    return false;
  }
  return mobileRegexPrimary.test(ua) || mobileRegexLegacy.test(ua);
}

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
      const isMobile = isMobileUA(req.headers['user-agent']);
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

        const root = isMobileUA(req.headers['user-agent'])
          ? mobilePath
          : staticPath;
        res.sendFile(join(root, 'index.html'));
      }
    );
  }
}
