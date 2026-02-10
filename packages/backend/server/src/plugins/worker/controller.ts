import {
  Controller,
  Get,
  Logger,
  Options,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { HTMLRewriter } from 'htmlrewriter';

import {
  BadRequest,
  Cache,
  readResponseBufferWithLimit,
  ResponseTooLargeError,
  safeFetch,
  SsrfBlockedError,
  type SSRFBlockReason,
  URLHelper,
  UseNamedGuard,
} from '../../base';
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
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const IMAGE_PROXY_MAX_BYTES = 10 * 1024 * 1024;
const LINK_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

function toBadRequestReason(reason: SSRFBlockReason) {
  switch (reason) {
    case 'disallowed_protocol':
    case 'url_has_credentials':
    case 'blocked_hostname':
    case 'blocked_ip':
    case 'invalid_url':
      return 'Invalid URL';
    case 'unresolvable_hostname':
      return 'Failed to resolve hostname';
    case 'too_many_redirects':
      return 'Too many redirects';
  }
}

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

  @Options('/image-proxy')
  imageProxyOption(
    @Req() request: ExpressRequest,
    @Res() resp: ExpressResponse
  ) {
    const origin = request.headers.origin;
    return resp
      .status(204)
      .header({
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      .send();
  }

  @Get('/image-proxy')
  async imageProxy(@Req() req: ExpressRequest, @Res() resp: ExpressResponse) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const originAllowed = origin
      ? isOriginAllowed(origin, this.allowedOrigin)
      : false;
    const refererAllowed = referer
      ? isRefererAllowed(referer, this.allowedOrigin)
      : false;
    if (!originAllowed && !refererAllowed) {
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
          ...getCorsHeaders(origin),
          ...(origin ? { Vary: 'Origin' } : {}),
          'Access-Control-Allow-Methods': 'GET',
          'Content-Type': 'image/*',
        })
        .send(buffer);
    }

    let response: Response;
    try {
      response = await safeFetch(
        targetURL.toString(),
        { method: 'GET', headers: cloneHeader(req.headers) },
        { timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS }
      );
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        const reason = error.data?.reason as SSRFBlockReason | undefined;
        this.logger.warn('Blocked image proxy target', {
          url: imageURL,
          reason,
          context: (error as any).context,
        });
        throw new BadRequest(toBadRequestReason(reason ?? 'invalid_url'));
      }
      if (error instanceof ResponseTooLargeError) {
        this.logger.warn('Image proxy response too large', {
          url: imageURL,
          limitBytes: error.data?.limitBytes,
          receivedBytes: error.data?.receivedBytes,
        });
        throw new BadRequest('Response too large');
      }
      this.logger.error('Failed to fetch image', {
        origin,
        url: imageURL,
        error,
      });
      throw new BadRequest('Failed to fetch image');
    }
    if (response.ok) {
      const contentType = response.headers.get('Content-Type');
      if (contentType?.startsWith('image/')) {
        let buffer: Buffer;
        try {
          buffer = await readResponseBufferWithLimit(
            response,
            IMAGE_PROXY_MAX_BYTES
          );
        } catch (error) {
          if (error instanceof ResponseTooLargeError) {
            this.logger.warn('Image proxy response too large', {
              url: imageURL,
              limitBytes: error.data?.limitBytes,
              receivedBytes: error.data?.receivedBytes,
            });
            throw new BadRequest('Response too large');
          }
          throw error;
        }
        await this.cache.set(cachedUrl, buffer.toString('base64'), {
          ttl: CACHE_TTL,
        });
        const contentDisposition = response.headers.get('Content-Disposition');
        return resp
          .status(200)
          .header({
            ...getCorsHeaders(origin),
            ...(origin ? { Vary: 'Origin' } : {}),
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
        status: response.status,
      });
      throw new BadRequest('Failed to fetch image');
    }
  }

  @Options('/link-preview')
  linkPreviewOption(
    @Req() request: ExpressRequest,
    @Res() resp: ExpressResponse
  ) {
    const origin = request.headers.origin;
    return resp
      .status(204)
      .header({
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      .send();
  }

  @Post('/link-preview')
  async linkPreview(
    @Req() request: ExpressRequest,
    @Res() resp: ExpressResponse
  ): Promise<ExpressResponse> {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const originAllowed = origin
      ? isOriginAllowed(origin, this.allowedOrigin)
      : false;
    const refererAllowed = referer
      ? isRefererAllowed(referer, this.allowedOrigin)
      : false;
    if (!originAllowed && !refererAllowed) {
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

      const method: 'GET' | 'HEAD' = requestBody?.head ? 'HEAD' : 'GET';

      const response = await safeFetch(
        targetURL.toString(),
        { method, headers: cloneHeader(request.headers) },
        { timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS }
      );
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
        const body = await readResponseBufferWithLimit(
          response,
          LINK_PREVIEW_MAX_BYTES
        );
        const limitedResponse = new Response(body, response);
        const resp = await decodeWithCharset(limitedResponse, res);

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
        const faviconResponse = await safeFetch(
          faviconUrl.toString(),
          { method: 'HEAD' },
          { timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS }
        );
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
      if (error instanceof SsrfBlockedError) {
        const reason = error.data?.reason as SSRFBlockReason | undefined;
        this.logger.warn('Blocked link preview target', {
          origin,
          url: requestBody?.url,
          reason,
          context: (error as any).context,
        });
        throw new BadRequest(toBadRequestReason(reason ?? 'invalid_url'));
      }
      if (error instanceof ResponseTooLargeError) {
        this.logger.warn('Link preview response too large', {
          origin,
          url: requestBody?.url,
          limitBytes: error.data?.limitBytes,
          receivedBytes: error.data?.receivedBytes,
        });
        throw new BadRequest('Response too large');
      }
      this.logger.error('Error fetching URL', {
        origin,
        url: targetURL,
        error,
      });
      throw new BadRequest('Error fetching URL');
    }
  }
}
