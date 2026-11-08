import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';

import {
  buildSafeCallbackUrl,
  evaluateLocalRedirect,
  evaluateRedirectUri,
} from '../../native';
import { Config } from '../config';
import { ActionForbidden } from '../error';
import { OnEvent } from '../event';

// Keep in sync with frontend /redirect-proxy allowlist.
const TRUSTED_REDIRECT_DOMAINS = [
  'google.com',
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
  'affine.pro',
].map(d => d.toLowerCase());

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

  safeLink(path: string, query: Record<string, any> = {}) {
    try {
      return buildSafeCallbackUrl(
        path,
        this.requestOrigin,
        this.allowedOrigins,
        Object.entries(query).map(([name, value]) => ({
          name,
          value: String(value),
        }))
      );
    } catch {
      throw new ActionForbidden();
    }
  }

  safeRedirect(res: Response, to: string) {
    try {
      const canonical = evaluateLocalRedirect(
        to,
        this.requestBaseUrl,
        this.redirectAllowHosts
      );
      return res.redirect(canonical);
    } catch {
      return res.redirect(this.baseUrl);
    }
  }

  canonicalRedirectUri(redirectUri: string, query: Record<string, any> = {}) {
    try {
      return evaluateRedirectUri(
        redirectUri,
        this.requestOrigin,
        this.allowedOrigins,
        TRUSTED_REDIRECT_DOMAINS,
        Object.entries(query).map(([name, value]) => ({
          name,
          value: String(value),
        }))
      );
    } catch {
      throw new ActionForbidden();
    }
  }

  redirectPolicy() {
    return {
      redirectBaseUrl: this.requestOrigin,
      redirectAllowedOrigins: this.allowedOrigins,
      redirectTrustedDomains: TRUSTED_REDIRECT_DOMAINS,
    };
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
