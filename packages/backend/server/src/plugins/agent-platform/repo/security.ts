/**
 * Security validation for repo operations.
 * Enforces allowlists, denylists, path traversal checks, and size limits.
 */
import { Injectable, Logger } from '@nestjs/common';
import { resolve, normalize, relative, isAbsolute } from 'node:path';
import {
  FORBIDDEN_PATH_PATTERNS,
  MAX_PATCH_BYTES_DEFAULT,
} from '@aion/agent-contracts';
import type { RepoPatch, RepoTarget } from '@aion/agent-contracts';

@Injectable()
export class RepoSecurityService {
  private readonly logger = new Logger(RepoSecurityService.name);

  private get allowedRepos(): string[] {
    const raw = process.env.ALLOWED_REPOS ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private get allowedPaths(): string[] {
    const raw = process.env.ALLOWED_PATHS ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private get forbiddenPaths(): string[] {
    const raw = process.env.FORBIDDEN_PATHS ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private get maxPatchBytes(): number {
    const raw = process.env.MAX_PATCH_BYTES;
    return raw ? parseInt(raw, 10) : MAX_PATCH_BYTES_DEFAULT;
  }

  /**
   * Validate a repo target is in the allowlist.
   */
  validateRepoTarget(target: RepoTarget): void {
    if (this.allowedRepos.length > 0) {
      const isAllowed = this.allowedRepos.some(
        (allowed) =>
          target.localPath.startsWith(allowed) ||
          target.repoId === allowed ||
          target.remoteUrl === allowed
      );
      if (!isAllowed) {
        throw new Error(
          `Repo "${target.repoId}" is not in ALLOWED_REPOS. ` +
            `Allowed: ${this.allowedRepos.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate all patches in a proposal.
   */
  validatePatches(patches: RepoPatch[], repoRoot: string): void {
    let totalBytes = 0;

    for (const patch of patches) {
      this.validatePatchPath(patch.path, repoRoot);
      totalBytes += Buffer.byteLength(patch.content, 'utf-8');
    }

    if (totalBytes > this.maxPatchBytes) {
      throw new Error(
        `Total patch size ${totalBytes} bytes exceeds MAX_PATCH_BYTES (${this.maxPatchBytes})`
      );
    }
  }

  /**
   * Validate a single file path is safe.
   */
  validatePatchPath(filePath: string, repoRoot: string): void {
    // Reject absolute paths
    if (isAbsolute(filePath)) {
      throw new Error(`Absolute paths not allowed: ${filePath}`);
    }

    // Resolve and check for path traversal
    const resolved = resolve(repoRoot, filePath);
    const rel = relative(repoRoot, resolved);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }

    const normalized = normalize(filePath);

    // Check forbidden patterns
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
      if (pattern.test(normalized)) {
        throw new Error(
          `Path matches forbidden pattern: ${filePath} (${pattern})`
        );
      }
    }

    // Check custom forbidden paths
    for (const forbidden of this.forbiddenPaths) {
      if (normalized.includes(forbidden)) {
        throw new Error(
          `Path matches FORBIDDEN_PATHS entry: ${filePath} (${forbidden})`
        );
      }
    }

    // If ALLOWED_PATHS is set, check the path is under one of them
    if (this.allowedPaths.length > 0) {
      const isAllowed = this.allowedPaths.some((allowed) =>
        normalized.startsWith(allowed)
      );
      if (!isAllowed) {
        throw new Error(
          `Path not in ALLOWED_PATHS: ${filePath}. Allowed: ${this.allowedPaths.join(', ')}`
        );
      }
    }
  }

  /**
   * Get the current security config for the /config endpoint.
   */
  getConfig() {
    return {
      allowedRepos: this.allowedRepos,
      maxPatchBytes: this.maxPatchBytes,
      forbiddenPaths: [
        ...FORBIDDEN_PATH_PATTERNS.map((p) => p.source),
        ...this.forbiddenPaths,
      ],
    };
  }
}
