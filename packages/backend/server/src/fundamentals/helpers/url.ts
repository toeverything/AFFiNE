import { Injectable } from '@nestjs/common';
import { type Response } from 'express';

import { Config } from '../config';

@Injectable()
export class URLHelper {
  redirectAllowHosts: string[];

  constructor(private readonly config: Config) {
    this.redirectAllowHosts = [this.config.baseUrl];
  }

  get home() {
    return this.config.baseUrl;
  }

  stringify(query: Record<string, any>) {
    return new URLSearchParams(query).toString();
  }

  link(path: string, query: Record<string, any> = {}) {
    const url = new URL(
      this.config.baseUrl + (path.startsWith('/') ? path : '/' + path)
    );

    for (const key in query) {
      url.searchParams.set(key, query[key]);
    }

    return url.toString();
  }

  safeRedirect(res: Response, to: string) {
    try {
      const finalTo = new URL(decodeURIComponent(to), this.config.baseUrl);

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
}
