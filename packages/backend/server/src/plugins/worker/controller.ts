import {
  Controller,
  Get,
  Logger,
  Options,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { HTMLRewriter } from 'htmlrewriter';

import { BadRequest, Cache, URLHelper, UseNamedGuard } from '../../base';
import { Public } from '../../core/auth';
import { WorkerService } from './service';
import type { LinkPreviewRequest, LinkPreviewResponse } from './types';
import {
  appendUrl,
  cloneHeader,
  fixUrl,
  getCorsHeaders,
  isOriginAllowed,
  isRefererAllowed,
  parseJson,
  reduceUrls,
} from './utils';
import { decodeWithCharset } from './utils/encoding';

// cache for 30 minutes
const CACHE_TTL = 1000 * 60 * 30;

@Public()
@UseNamedGuard('selfhost')
@Controller('/api/worker')
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);

  constructor(
    private readonly cache: Cache,
    private readonly url: URLHelper,
    private readonly service: WorkerService
  ) {}

  private get allowedOrigin() {
    return this.service.allowedOrigins;
  }

  @Get('/image-proxy')
  async imageProxy(@Req() req: Request, @Res() resp: Response) {
    const origin = req.headers.origin ?? '';
    const referer = req.headers.referer;
    if (
      (origin && !isOriginAllowed(origin, this.allowedOrigin)) ||
      (referer && !isRefererAllowed(referer, this.allowedOrigin))
    ) {
      this.logger.error('Invalid Origin', 'ERROR', { origin, referer });
      throw new BadRequest('Invalid header');
    }
    const url = new URL(req.url, this.url.requestBaseUrl);
    const imageURL = url.searchParams.get('url');
    if (!imageURL) {
      throw new BadRequest('Missing "url" parameter');
    }

    const targetURL = fixUrl(imageURL);
    if (!targetURL) {
      this.logger.error(`Invalid URL: ${url}`);
      throw new BadRequest(`Invalid URL`);
    }

    const cachedUrl = `image-proxy:${targetURL.toString()}`;
    const cachedResponse = await this.cache.get<string>(cachedUrl);
    if (cachedResponse) {
      const buffer = Buffer.from(cachedResponse, 'base64');
      // if cached response is empty, it means the request is rejected by server previously
      if (buffer.length === 0) {
        return resp.status(404).header(getCorsHeaders(origin)).send();
      }
      return resp
        .status(200)
        .header({
          'Access-Control-Allow-Origin': origin,
          Vary: 'Origin',
          'Access-Control-Allow-Methods': 'GET',
          'Content-Type': 'image/*',
        })
        .send(buffer);
    }

    const response = await fetch(
      new Request(targetURL.toString(), {
        method: 'GET',
        headers: cloneHeader(req.headers),
      })
    );
    if (response.ok) {
      const contentType = response.headers.get('Content-Type');
      if (contentType?.startsWith('image/')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await this.cache.set(cachedUrl, buffer.toString('base64'), {
          ttl: CACHE_TTL,
        });
        const contentDisposition = response.headers.get('Content-Disposition');
        return resp
          .status(200)
          .header({
            'Access-Control-Allow-Origin': origin ?? 'null',
            Vary: 'Origin',
            'Access-Control-Allow-Methods': 'GET',
            'Content-Type': contentType,
            'Content-Disposition': contentDisposition,
          })
          .send(buffer);
      } else {
        throw new BadRequest('Invalid content type');
      }
    } else {
      if (response.status >= 400 && response.status < 500) {
        // rejected by server, cache a empty response
        await this.cache.set(cachedUrl, Buffer.from([]).toString('base64'), {
          ttl: CACHE_TTL,
        });
      }
      this.logger.error('Failed to fetch image', {
        origin,
        url: imageURL,
        status: resp.status,
      });
      throw new BadRequest('Failed to fetch image');
    }
  }

  @Options('/link-preview')
  linkPreviewOption(@Req() request: Request, @Res() resp: Response) {
    const origin = request.headers.origin;
    return resp
      .status(200)
      .header({
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      .send();
  }

  @Post('/link-preview')
  async linkPreview(
    @Req() request: Request,
    @Res() resp: Response
  ): Promise<Response> {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    if (
      (origin && !isOriginAllowed(origin, this.allowedOrigin)) ||
      (referer && !isRefererAllowed(referer, this.allowedOrigin))
    ) {
      this.logger.error('Invalid Origin', { origin, referer });
      throw new BadRequest('Invalid header');
    }

    this.logger.debug('Received request', { origin, method: request.method });

    const requestBody = parseJson<LinkPreviewRequest>(request.body);
    const targetURL = fixUrl(requestBody?.url);
    // not allow same site preview
    if (!targetURL || isOriginAllowed(targetURL.origin, this.allowedOrigin)) {
      this.logger.error('Invalid URL', { origin, url: requestBody?.url });
      throw new BadRequest('Invalid URL');
    }

    this.logger.debug('Processing request', { origin, url: targetURL });

    try {
      const cachedUrl = `link-preview:${targetURL.toString()}`;
      const cachedResponse = await this.cache.get<string>(cachedUrl);
      if (cachedResponse) {
        return resp
          .status(200)
          .header({
            'content-type': 'application/json;charset=UTF-8',
            ...getCorsHeaders(origin),
          })
          .send(cachedResponse);
      }

      const response = await fetch(targetURL, {
        headers: cloneHeader(request.headers),
      });
      this.logger.debug('Fetched URL', {
        origin,
        url: targetURL,
        status: response.status,
      });

      if (requestBody?.head) {
        return resp
          .status(
            response.status >= 200 && response.status < 400
              ? 204
              : response.status
          )
          .header(getCorsHeaders(origin))
          .send();
      }

      const res: LinkPreviewResponse = {
        url: response.url,
        images: [],
        videos: [],
        favicons: [],
      };

      if (response.body) {
        const resp = await decodeWithCharset(response, res);

        const rewriter = new HTMLRewriter()
          .on('meta', {
            element(element) {
              const property =
                element.getAttribute('property') ??
                element.getAttribute('name');
              const content = element.getAttribute('content');
              if (property && content) {
                switch (property.toLowerCase()) {
                  case 'og:title':
                    res.title = content;
                    break;
                  case 'og:site_name':
                    res.siteName = content;
                    break;
                  case 'og:description':
                    res.description = content;
                    break;
                  case 'og:image':
                    appendUrl(content, res.images);
                    break;
                  case 'og:video':
                    appendUrl(content, res.videos);
                    break;
                  case 'og:type':
                    res.mediaType = content;
                    break;
                  case 'description':
                    if (!res.description) {
                      res.description = content;
                    }
                }
              }
            },
          })
          .on('link', {
            element(element) {
              if (element.getAttribute('rel')?.toLowerCase().includes('icon')) {
                appendUrl(element.getAttribute('href'), res.favicons);
              }
            },
          })
          .on('title', {
            text(text) {
              if (!res.title) {
                res.title = text.text;
              }
            },
          })
          .on('img', {
            element(element) {
              appendUrl(element.getAttribute('src'), res.images);
            },
          })
          .on('video', {
            element(element) {
              appendUrl(element.getAttribute('src'), res.videos);
            },
          });

        await rewriter.transform(resp).text();

        res.images = await reduceUrls(res.images);

        this.logger.debug('Processed response with HTMLRewriter', {
          origin,
          url: response.url,
        });
      }

      // fix favicon
      {
        // head default path of favicon
        const faviconUrl = new URL('/favicon.ico?v=2', response.url);
        const faviconResponse = await fetch(faviconUrl, { method: 'HEAD' });
        if (faviconResponse.ok) {
          appendUrl(faviconUrl.toString(), res.favicons);
        }

        res.favicons = await reduceUrls(res.favicons);
      }

      const json = JSON.stringify(res);
      this.logger.debug('Sending response', {
        origin,
        url: res.url,
        responseSize: json.length,
      });

      await this.cache.set(cachedUrl, res, { ttl: CACHE_TTL });
      return resp
        .status(200)
        .header({
          'content-type': 'application/json;charset=UTF-8',
          ...getCorsHeaders(origin),
        })
        .send(json);
    } catch (error) {
      this.logger.error('Error fetching URL', {
        origin,
        url: targetURL,
        error,
      });
      throw new BadRequest('Error fetching URL');
    }
  }
}
