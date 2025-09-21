import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { Config } from '../config';
import { OnEvent } from '../event';

@Injectable()
export class URLHelper {
  redirectAllowHosts!: string[];

  origin!: string;
  allowedOrigins!: string[];
  baseUrl!: string;

  constructor(
    private readonly config: Config,
    private readonly cls?: ClsService
  ) {
    this.init();
  }

  @OnEvent('config.changed')
  @OnEvent('config.init')
  init() {
    if (this.config.server.externalUrl) {
      if (!this.verify(this.config.server.externalUrl)) {
        throw new Error(
          'Invalid `server.externalUrl` configured. It must be a valid url.'
        );
      }

      const externalUrl = new URL(this.config.server.externalUrl);

      this.origin = externalUrl.origin;
      this.baseUrl =
        externalUrl.origin + externalUrl.pathname.replace(/\/$/, '');
    } else {
      this.origin = this.convertHostToOrigin(this.config.server.host);
      this.baseUrl = this.origin + this.config.server.path;
    }

    this.redirectAllowHosts = [this.baseUrl];

    this.allowedOrigins = [this.origin];
    if (this.config.server.hosts.length > 0) {
      for (const host of this.config.server.hosts) {
        this.allowedOrigins.push(this.convertHostToOrigin(host));
      }
    }
  }

  get requestOrigin() {
    if (this.config.server.hosts.length === 0) {
      return this.origin;
    }

    // support multiple hosts
    const requestHost = this.cls?.get<string | undefined>(CLS_REQUEST_HOST);
    if (!requestHost || !this.config.server.hosts.includes(requestHost)) {
      return this.origin;
    }

    return this.convertHostToOrigin(requestHost);
  }

  get requestBaseUrl() {
    if (this.config.server.hosts.length === 0) {
      return this.baseUrl;
    }

    return this.requestOrigin + this.config.server.path;
  }

  stringify(query: Record<string, any>) {
    return new URLSearchParams(query).toString();
  }

  addSimpleQuery(
    url: string,
    key: string,
    value: string | number | boolean,
    escape = true
  ) {
    const urlObj = new URL(url);
    if (escape) {
      urlObj.searchParams.set(key, encodeURIComponent(value));
      return urlObj.toString();
    } else {
      const query =
        (urlObj.search ? urlObj.search + '&' : '?') + `${key}=${value}`;

      return urlObj.origin + urlObj.pathname + query;
    }
  }

  url(path: string, query: Record<string, any> = {}) {
    const url = new URL(path, this.requestOrigin);

    for (const key in query) {
      url.searchParams.set(key, query[key]);
    }

    return url;
  }

  link(path: string, query: Record<string, any> = {}) {
    return this.url(path, query).toString();
  }

  safeRedirect(res: Response, to: string) {
    try {
      const finalTo = new URL(decodeURIComponent(to), this.requestBaseUrl);

      for (const host of this.redirectAllowHosts) {
        const hostURL = new URL(host);
        if (
          hostURL.origin === finalTo.origin &&
          finalTo.pathname.startsWith(hostURL.pathname)
        ) {
          return res.redirect(finalTo.toString().replace(/\/$/, ''));
        }
      }
    } catch {
      // just ignore invalid url
    }

    // redirect to home if the url is invalid
    return res.redirect(this.baseUrl);
  }

  verify(url: string | URL) {
    try {
      if (typeof url === 'string') {
        url = new URL(url);
      }
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      if (!url.hostname) return false;
      return true;
    } catch {
      return false;
    }
  }

  private convertHostToOrigin(host: string) {
    return [
      this.config.server.https ? 'https' : 'http',
      '://',
      host,
      host === 'localhost' || isIP(host) ? `:${this.config.server.port}` : '',
    ].join('');
  }
}
