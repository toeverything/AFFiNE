import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { Config } from '../config';
import { OnEvent } from '../event';

@Injectable()
export class URLHelper {
  redirectAllowHosts!: string[];

  origin!: string;
  baseUrl!: string;
  home!: string;

  constructor(private readonly config: Config) {
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
      this.origin = [
        this.config.server.https ? 'https' : 'http',
        '://',
        this.config.server.host,
        this.config.server.host === 'localhost' || isIP(this.config.server.host)
          ? `:${this.config.server.port}`
          : '',
      ].join('');
      this.baseUrl = this.origin + this.config.server.path;
    }

    this.home = this.baseUrl;
    this.redirectAllowHosts = [this.baseUrl];
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
    const url = new URL(path, this.origin);

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
      const finalTo = new URL(decodeURIComponent(to), this.baseUrl);

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
    return res.redirect(this.home);
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
}
