import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import isMobile from 'is-mobile';

import { Config, metrics } from '../../base';
import { Models } from '../../models';
import { htmlSanitize } from '../../native';
import { Public } from '../auth';
import { DocReader } from '../doc';

interface RenderOptions {
  title: string;
  summary: string;
  avatar?: string;
}

interface HtmlAssets {
  css: string[];
  js: string[];
  publicPath: string;
  gitHash: string;
  description: string;
}

const defaultAssets: HtmlAssets = {
  css: [],
  js: [],
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
    private readonly doc: DocReader,
    private readonly models: Models,
    private readonly config: Config
  ) {
    this.webAssets = this.readHtmlAssets(join(env.projectRoot, 'static'));
    this.mobileAssets = this.readHtmlAssets(
      join(env.projectRoot, 'static/mobile')
    );
  }

  @Public()
  @Get('/*path')
  async render(@Req() req: Request, @Res() res: Response) {
    const assets: HtmlAssets =
      env.namespaces.canary &&
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
    const allowSharing = await this.models.workspace.allowSharing(workspaceId);
    if (!allowSharing) {
      return null;
    }

    let allowUrlPreview = await this.models.doc.isPublic(workspaceId, docId);

    if (!allowUrlPreview) {
      // if page is private, but workspace url preview is on
      allowUrlPreview =
        await this.models.workspace.allowUrlPreview(workspaceId);
    }

    if (allowUrlPreview) {
      return this.doc.getDocContent(workspaceId, docId);
    }

    return null;
  }

  private async getWorkspaceContent(
    workspaceId: string
  ): Promise<RenderOptions | null> {
    const allowSharing = await this.models.workspace.allowSharing(workspaceId);
    if (!allowSharing) {
      return null;
    }

    const allowUrlPreview =
      await this.models.workspace.allowUrlPreview(workspaceId);

    if (allowUrlPreview) {
      const workspaceContent = await this.doc.getWorkspaceContent(workspaceId);

      if (workspaceContent) {
        return {
          title: workspaceContent.name,
          summary: '',
          avatar: workspaceContent.avatarUrl,
        };
      }
    }

    return null;
  }

  // @TODO(@forehalo): pre-compile html template to accelerate serializing
  _render(opts: RenderOptions | null, assets: HtmlAssets): string {
    // TODO(@forehalo): how can we enable the type reference to @affine/env
    const envMeta: Record<string, any> = {
      publicPath: assets.publicPath,
      subPath: this.config.server.path,
      renderer: 'ssr',
    };

    if (env.selfhosted) {
      envMeta.isSelfHosted = true;
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
    ${env.selfhosted ? '' : '<meta name="apple-itunes-app" content="app-id=6736937980" />'}

    <title>${title}</title>
    <meta name="theme-color" content="#fafafa" />
    ${assets.publicPath.startsWith('/') ? '' : `<link rel="preconnect" href="${assets.publicPath}" />`}
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="icon" sizes="192x192" href="/favicon-192.png" />
    <link rel="shortcut icon" href="/favicon.ico?v=2" />
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
    ${Object.entries(envMeta)
      .map(([key, val]) => `<meta name="env:${key}" content="${val}" />`)
      .join('\n')}
    ${assets.css.map(url => `<link rel="stylesheet" href="${url}" crossorigin />`).join('\n')}
  </head>
  <body>
    <div id="app" data-version="${assets.gitHash}"></div>
    ${assets.js.map(url => `<script src="${url}" crossorigin></script>`).join('\n')}
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

      const publicPath = env.selfhosted ? '/' : assets.publicPath;

      assets.publicPath = publicPath;
      assets.js = assets.js.map(path => publicPath + path);
      assets.css = assets.css.map(path => publicPath + path);

      return assets;
    } catch (e) {
      if (env.prod) {
        throw e;
      } else {
        return defaultAssets;
      }
    }
  }
}
