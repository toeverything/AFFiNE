import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import xss from 'xss';

import { DocNotFound } from '../../fundamentals';
import { PermissionService } from '../permission';
import { PageDocContent } from '../utils/blocksuite';
import { DocContentService } from './service';

interface RenderOptions {
  og: boolean;
  content: boolean;
}

@Controller('/workspace/:workspaceId/:docId')
export class DocRendererController {
  constructor(
    private readonly doc: DocContentService,
    private readonly permission: PermissionService
  ) {}

  @Get()
  async render(
    @Res() res: Response,
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string
  ) {
    if (workspaceId === docId) {
      throw new DocNotFound({ spaceId: workspaceId, docId });
    }

    // if page is public, show all
    // if page is private, but workspace public og is on, show og but not content
    const opts: RenderOptions = {
      og: false,
      content: false,
    };
    const isPagePublic = await this.permission.isPublicPage(workspaceId, docId);

    if (isPagePublic) {
      opts.og = true;
      opts.content = true;
    } else {
      const allowPreview = await this.permission.allowUrlPreview(workspaceId);

      if (allowPreview) {
        opts.og = true;
      }
    }

    let docContent = opts.og
      ? await this.doc.getPageContent(workspaceId, docId)
      : null;
    if (!docContent) {
      docContent = { title: 'untitled', summary: '' };
    }

    res.setHeader('Content-Type', 'text/html');
    if (!opts.og) {
      res.setHeader('X-Robots-Tag', 'noindex');
    }
    res.send(this._render(docContent, opts));
  }

  _render(doc: PageDocContent, { og }: RenderOptions): string {
    const title = xss(doc.title);
    const summary = xss(doc.summary);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} | AFFiNE</title>
          <meta name="theme-color" content="#fafafa" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" sizes="192x192" href="/favicon-192.png" />
          ${!og ? '<meta name="robots" content="noindex, nofollow" />' : ''}
          <meta
            name="twitter:title"
            content="AFFiNE: There can be more than Notion and Miro."
          />
          <meta name="twitter:description" content="${title}" />
          <meta name="twitter:site" content="@AffineOfficial" />
          <meta name="twitter:image" content="https://affine.pro/og.jpeg" />
          <meta property="og:title" content="${title}" />
          <meta property="og:description" content="${summary}" />
          <meta property="og:image" content="https://affine.pro/og.jpeg" />
        </head>
        <body>
        </body>
      </html>
    `;
  }
}
