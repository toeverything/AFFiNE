import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import isMobile from 'is-mobile';

import { Config, metrics, URLHelper } from '../../fundamentals';
import { htmlSanitize } from '../../native';
import { Public } from '../auth';
import { PermissionService } from '../permission';
import { DocContentService } from './service';

interface RenderOptions {
  title: string;
  summary: string;
  avatar?: string;
}

interface HtmlAssets {
  css: string[];
  js: string[];
  selfhostPublicPath: string;
  publicPath: string;
  gitHash: string;
  description: string;
}

const defaultAssets: HtmlAssets = {
  css: [],
  js: [],
  selfhostPublicPath: '/',
  publicPath: '/',
  gitHash: '',
  description: '',
};

// TODO(@forehalo): reuse routes with frontend
const staticPaths = new Set([
  'all',
  'home',
  'search',
  'collection',
  'tag',
  'trash',
]);

@Controller('/workspace')
export class DocRendererController {
  private readonly logger = new Logger(DocRendererController.name);
  private readonly webAssets: HtmlAssets = defaultAssets;
  private readonly mobileAssets: HtmlAssets = defaultAssets;

  constructor(
    private readonly doc: DocContentService,
    private readonly permission: PermissionService,
    private readonly config: Config,
    private readonly url: URLHelper
  ) {
    this.webAssets = this.readHtmlAssets(
      join(
        this.config.projectRoot,
        this.config.isSelfhosted ? 'static/selfhost' : 'static'
      )
    );
    this.mobileAssets = this.readHtmlAssets(
      join(
        this.config.projectRoot,
        this.config.isSelfhosted ? 'static/mobile/selfhost' : 'static/mobile'
      )
    );
  }

  @Public()
  @Get('/*')
  async render(@Req() req: Request, @Res() res: Response) {
    const assets: HtmlAssets =
      this.config.affine.canary &&
      isMobile({
        ua: req.headers['user-agent'] ?? undefined,
      })
        ? this.mobileAssets
        : this.webAssets;

    let opts: RenderOptions | null = null;
    // /workspace/:workspaceId/{:docId | staticPaths}
    const [, , workspaceId, subPath, ...restPaths] = req.path.split('/');

    // /:workspaceId/:docId
    if (workspaceId && !staticPaths.has(subPath) && restPaths.length === 0) {
      try {
        opts =
          workspaceId === subPath
            ? await this.getWorkspaceContent(workspaceId)
            : await this.getPageContent(workspaceId, subPath);
        metrics.doc.counter('render').add(1);
      } catch (e) {
        this.logger.error('failed to render page', e);
      }
    }

    res.setHeader('Content-Type', 'text/html');
    if (!opts) {
      res.setHeader('X-Robots-Tag', 'noindex');
    }

    res.send(this._render(opts, assets));
  }

  private async getPageContent(
    workspaceId: string,
    docId: string
  ): Promise<RenderOptions | null> {
    let allowUrlPreview = await this.permission.isPublicPage(
      workspaceId,
      docId
    );

    if (!allowUrlPreview) {
      // if page is private, but workspace url preview is on
      allowUrlPreview = await this.permission.allowUrlPreview(workspaceId);
    }

    if (allowUrlPreview) {
      return this.doc.getPageContent(workspaceId, docId);
    }

    return null;
  }

  private async getWorkspaceContent(
    workspaceId: string
  ): Promise<RenderOptions | null> {
    const allowUrlPreview = await this.permission.allowUrlPreview(workspaceId);

    if (allowUrlPreview) {
      const workspaceContent = await this.doc.getWorkspaceContent(workspaceId);

      if (workspaceContent) {
        return {
          title: workspaceContent.name,
          summary: '',
          avatar: workspaceContent.avatarKey
            ? this.url.link(
                `/api/workspaces/${workspaceId}/blobs/${workspaceContent.avatarKey}`
              )
            : undefined,
        };
      }
    }

    return null;
  }

  _render(opts: RenderOptions | null, assets: HtmlAssets): string {
    // TODO(@forehalo): how can we enable the type reference to @affine/env
    let env: Record<string, any> = {};
    if (this.config.isSelfhosted) {
      env = {
        isSelfHosted: true,
        publicPath: assets.selfhostPublicPath,
      };
    }

    const title = opts?.title
      ? htmlSanitize(`${opts.title} | AFFiNE`)
      : 'AFFiNE';
    const summary = opts ? htmlSanitize(opts.summary) : assets.description;
    const image = opts?.avatar ?? 'https://affine.pro/og.jpeg';

    // TODO(@forehalo): parse assets/index.html
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />

    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta
      name="apple-mobile-web-app-status-bar-style"
      content="black-translucent"
    />

    <title>${title}</title>
    <meta name="theme-color" content="#fafafa" />
    <link rel="preconnect" href="${assets.publicPath}">
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="icon" sizes="192x192" href="/favicon-192.png" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <meta name="emotion-insertion-point" content="" />
    ${!opts ? '<meta name="robots" content="noindex, nofollow" />' : ''}
    <meta
      name="twitter:title"
      content="${title}"
    />
    <meta name="twitter:description" content="${summary}" />
    <meta name="twitter:site" content="@AffineOfficial" />
    <meta name="twitter:image" content="${image}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${summary}" />
    <meta property="og:image" content="${image}" />
    ${Object.entries(env)
      .map(([key, val]) => `<meta name="env:${key}" content="${val}" />`)
      .join('\n')}
    ${assets.css.map(url => `<link rel="stylesheet" href="${url}" />`).join('\n')}
  </head>
  <body>
    <div id="app" data-version="${assets.gitHash}"></div>
    ${assets.js.map(url => `<script src="${url}"></script>`).join('\n')}
  </body>
</html>
    `;
  }

  /**
   * Should only be called at startup time
   */
  private readHtmlAssets(path: string): HtmlAssets {
    const manifestPath = join(path, 'assets-manifest.json');

    try {
      const assets: HtmlAssets = JSON.parse(
        readFileSync(manifestPath, 'utf-8')
      );

      const publicPath = this.config.isSelfhosted
        ? this.config.server.host + assets.selfhostPublicPath
        : assets.publicPath;

      if (this.config.isSelfhosted) {
        // append `config.server.host` to public path
        assets.selfhostPublicPath = publicPath;
      }

      assets.js = assets.js.map(path => publicPath + path);
      assets.css = assets.css.map(path => publicPath + path);

      return assets;
    } catch (e) {
      if (this.config.node.prod) {
        throw e;
      } else {
        return defaultAssets;
      }
    }
  }
}
