/**
 * GitHub App Service — authenticates via GitHub App installation tokens.
 * Uses `jsonwebtoken` + native `fetch` (no @octokit dependency).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import jwt from 'jsonwebtoken';

const GITHUB_API = 'https://api.github.com';

interface InstallationTokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

interface GitHubRepo {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
}

@Injectable()
export class GitHubAppService implements OnModuleInit {
  private readonly logger = new Logger(GitHubAppService.name);

  private appId: string | undefined;
  private installationId: string | undefined;
  private privateKey: string | undefined;
  private tokenCache: InstallationTokenCache | null = null;

  onModuleInit() {
    this.appId = process.env.GITHUB_APP_ID;
    this.installationId = process.env.GITHUB_INSTALLATION_ID;
    this.privateKey = process.env.GITHUB_PRIVATE_KEY;

    if (this.isConfigured()) {
      this.logger.log(
        `GitHub App configured: appId=${this.appId}, installationId=${this.installationId}`
      );
    } else {
      this.logger.warn(
        'GitHub App not fully configured — missing env vars (GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_PRIVATE_KEY)'
      );
    }
  }

  isConfigured(): boolean {
    return !!(this.appId && this.installationId && this.privateKey);
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      appId: this.appId ?? null,
      installationId: this.installationId ?? null,
    };
  }

  /**
   * Generate a JWT signed with the GitHub App's private key.
   * TTL: 10 minutes (GitHub max).
   */
  private generateJWT(): string {
    if (!this.appId || !this.privateKey) {
      throw new Error('GitHub App not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iat: now - 60, // allow clock drift
        exp: now + 600, // 10 min
        iss: this.appId,
      },
      this.privateKey,
      { algorithm: 'RS256' }
    );
  }

  /**
   * Get an installation access token (cached until 5 min before expiry).
   */
  async getInstallationToken(): Promise<string> {
    if (!this.installationId) {
      throw new Error('GitHub App not configured');
    }

    // Return cached token if still valid (with 5 min buffer)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 5 * 60 * 1000) {
      return this.tokenCache.token;
    }

    const appJwt = this.generateJWT();
    const res = await fetch(
      `${GITHUB_API}/app/installations/${this.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Failed to get installation token (${res.status}): ${body}`
      );
    }

    const data = (await res.json()) as { token: string; expires_at: string };
    this.tokenCache = {
      token: data.token,
      expiresAt: new Date(data.expires_at).getTime(),
    };

    this.logger.log('Refreshed GitHub installation token');
    return data.token;
  }

  /**
   * List repositories accessible to the installation (with pagination).
   */
  async listRepositories(): Promise<
    Array<{
      id: number;
      fullName: string;
      defaultBranch: string;
      private: boolean;
      htmlUrl: string;
    }>
  > {
    const token = await this.getInstallationToken();
    const repos: Array<{
      id: number;
      fullName: string;
      defaultBranch: string;
      private: boolean;
      htmlUrl: string;
    }> = [];

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(
        `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Failed to list repositories (${res.status}): ${body}`
        );
      }

      const data = (await res.json()) as {
        total_count: number;
        repositories: GitHubRepo[];
      };

      for (const r of data.repositories) {
        repos.push({
          id: r.id,
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          private: r.private,
          htmlUrl: r.html_url,
        });
      }

      hasMore = repos.length < data.total_count;
      page++;
    }

    return repos;
  }

  /**
   * Build an authenticated HTTPS clone URL using the installation token.
   */
  async getAuthenticatedCloneUrl(fullName: string): Promise<string> {
    const token = await this.getInstallationToken();
    return `https://x-access-token:${token}@github.com/${fullName}.git`;
  }
}
