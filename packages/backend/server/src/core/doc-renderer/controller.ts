import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Logger, Param, Req, Res } from '@nestjs/common';
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
    try {
      const webConfigMapsPath = join(
        this.config.projectRoot,
        this.config.isSelfhosted ? 'static/selfhost' : 'static',
        'assets-manifest.json'
      );
      const mobileConfigMapsPath = join(
        this.config.projectRoot,
        this.config.isSelfhosted ? 'static/mobile/selfhost' : 'static/mobile',
        'assets-manifest.json'
      );
      this.webAssets = JSON.parse(readFileSync(webConfigMapsPath, 'utf-8'));
      this.mobileAssets = JSON.parse(
        readFileSync(mobileConfigMapsPath, 'utf-8')
      );
    } catch (e) {
      if (this.config.node.prod) {
        throw e;
      }
    }
  }

  @Public()
  @Get('/:workspaceId/:docId')
  async render(
    @Req() req: Request,
    @Res() res: Response,
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string
  ) {
    const assets: HtmlAssets =
      this.config.affine.canary &&
      isMobile({
        ua: req.headers['user-agent'] ?? undefined,
      })
        ? this.mobileAssets
        : this.webAssets;

    let opts: RenderOptions | null = null;
    try {
      opts =
        workspaceId === docId
          ? await this.getWorkspaceContent(workspaceId)
          : await this.getPageContent(workspaceId, docId);
      metrics.doc.counter('render').add(1);
    } catch (e) {
      this.logger.error('failed to render page', e);
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
    ${assets.css.map(url => `<link rel="stylesheet" href="${url}" />`).join('\n')}
  </head>
  <body>
    <div id="app" data-version="${assets.gitHash}"></div>
    ${assets.js.map(url => `<script src="${url}"></script>`).join('\n')}
  </body>
</html>
    `;
  }
}
