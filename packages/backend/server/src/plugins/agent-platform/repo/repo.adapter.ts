/**
 * Repository adapter for local file operations and git.
 * Handles cloning, diffing, patching, and PR creation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFile,
  writeFile,
  mkdir,
  access,
  stat,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createPatch } from 'diff';
import type { RepoPatch, RepoTarget } from '@aion/agent-contracts';
import { RepoSecurityService } from './security';

const execFileAsync = promisify(execFile);

@Injectable()
export class RepoAdapter {
  private readonly logger = new Logger(RepoAdapter.name);

  constructor(private readonly security: RepoSecurityService) {}

  /**
   * Ensure a repo is cloned and available locally.
   * If the repo already exists and a remoteUrl is provided, refresh the
   * origin URL (e.g. to update an expired installation token).
   */
  async ensureRepo(target: RepoTarget): Promise<void> {
    this.security.validateRepoTarget(target);

    try {
      await access(join(target.localPath, '.git'));
      this.logger.log(`Repo already exists at ${target.localPath}`);

      // Refresh remote URL if provided (token may have expired)
      if (target.remoteUrl) {
        try {
          await execFileAsync(
            'git',
            ['remote', 'set-url', 'origin', target.remoteUrl],
            { cwd: target.localPath }
          );
          this.logger.log(`Refreshed remote URL for ${target.localPath}`);
        } catch (err) {
          this.logger.warn(
            `Failed to refresh remote URL: ${(err as Error).message}`
          );
        }
      }
    } catch {
      if (!target.remoteUrl) {
        throw new Error(
          `Repo not found at ${target.localPath} and no remoteUrl to clone from`
        );
      }
      this.logger.log(`Cloning ${target.remoteUrl} to ${target.localPath}`);
      await mkdir(target.localPath, { recursive: true });
      await execFileAsync('git', ['clone', target.remoteUrl, target.localPath]);
    }
  }

  /**
   * Compute unified diff for a set of patches against the repo.
   */
  async computeDiff(
    repoRoot: string,
    patches: RepoPatch[]
  ): Promise<string> {
    this.security.validatePatches(patches, repoRoot);

    const diffs: string[] = [];

    for (const patch of patches) {
      const fullPath = join(repoRoot, patch.path);
      let original = '';

      if (patch.type === 'update' || patch.type === 'delete') {
        try {
          original = await readFile(fullPath, 'utf-8');
        } catch {
          original = '';
        }
      }

      const newContent = patch.type === 'delete' ? '' : patch.content;
      const diff = createPatch(
        patch.path,
        original,
        newContent,
        'current',
        'proposed'
      );
      diffs.push(diff);
    }

    return diffs.join('\n');
  }

  /**
   * Compute a before/after diff for brief edits.
   */
  computeBriefDiff(
    originalBrief: string,
    edits: Array<{ rangeHint: string; markdown: string }>
  ): string {
    // Simple approach: show a unified diff of the whole brief
    // In a real implementation, we'd apply edits by range hints
    let modified = originalBrief;
    for (const edit of edits) {
      // Try to find the range hint as a heading or keyword
      const hintRegex = new RegExp(
        `(${escapeRegex(edit.rangeHint)}[\\s\\S]*?)(?=\\n## |$)`,
        'i'
      );
      const match = modified.match(hintRegex);
      if (match) {
        modified = modified.replace(match[0], edit.markdown);
      } else {
        // Append as a new section
        modified += `\n\n${edit.markdown}`;
      }
    }

    return createPatch('brief.md', originalBrief, modified, 'current', 'proposed');
  }

  /**
   * Apply patches to the repo filesystem.
   */
  async applyPatches(
    repoRoot: string,
    patches: RepoPatch[]
  ): Promise<string[]> {
    this.security.validatePatches(patches, repoRoot);

    const appliedFiles: string[] = [];

    for (const patch of patches) {
      const fullPath = join(repoRoot, patch.path);

      if (patch.type === 'delete') {
        // We don't delete files for safety — just log
        this.logger.warn(
          `Skipping delete of ${patch.path} — manual deletion required`
        );
        continue;
      }

      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, patch.content, 'utf-8');
      appliedFiles.push(patch.path);
      this.logger.log(`Applied ${patch.type}: ${patch.path}`);
    }

    return appliedFiles;
  }

  /**
   * Create a new git branch from the default branch.
   * Checks out the default branch, pulls latest, then creates the new branch.
   */
  async createBranch(
    repoRoot: string,
    branchName: string,
    defaultBranch: string
  ): Promise<void> {
    const git = (args: string[]) =>
      execFileAsync('git', args, { cwd: repoRoot });

    this.logger.log(`Creating branch ${branchName} from ${defaultBranch} in ${repoRoot}`);

    // Use switchBranch which auto-commits pending changes on the current branch
    await this.switchBranch(repoRoot, branchName, defaultBranch);
  }

  /**
   * Switch to a doc-specific branch, auto-committing any pending changes
   * on the current branch first so nothing is lost.
   * Creates the branch from defaultBranch if it doesn't exist yet.
   */
  async switchBranch(
    repoRoot: string,
    branchName: string,
    defaultBranch: string
  ): Promise<void> {
    const git = (args: string[]) =>
      execFileAsync('git', args, { cwd: repoRoot });

    // What branch are we on right now?
    const { stdout: currentBranch } = await git(['branch', '--show-current']);
    const current = currentBranch.trim();

    if (current === branchName) {
      this.logger.debug(`Already on branch ${branchName}`);
      return;
    }

    // Auto-commit any uncommitted changes on the current branch
    const { stdout: statusOut } = await git(['status', '--porcelain']);
    if (statusOut.trim().length > 0) {
      this.logger.log(`Auto-committing changes on branch ${current} before switching`);
      await git(['add', '-A']);
      try {
        await git(['commit', '-m', `wip: auto-save before switching to ${branchName}`]);
      } catch {
        // commit may fail if nothing staged (e.g. only untracked ignored files)
      }
    }

    // Check if target branch exists
    try {
      await git(['rev-parse', '--verify', branchName]);
      // Branch exists — checkout
      await git(['checkout', branchName]);
      this.logger.log(`Switched to existing branch ${branchName}`);
    } catch {
      // Branch doesn't exist — create from defaultBranch
      this.logger.log(`Creating new branch ${branchName} from ${defaultBranch}`);
      await git(['checkout', '-b', branchName, defaultBranch]);
    }
  }

  /**
   * Commit and push changes on the current branch for PR creation.
   * Assumes the branch already exists and is checked out.
   */
  async prepareBranch(
    repoRoot: string,
    branchName: string,
    commitMessage: string
  ): Promise<void> {
    const git = (args: string[]) =>
      execFileAsync('git', args, { cwd: repoRoot });

    // Ensure we're on the right branch
    try {
      await git(['checkout', branchName]);
    } catch {
      // Branch might already be checked out
    }
    await git(['add', '-A']);
    await git(['commit', '-m', commitMessage]);
    await git(['push', '-u', 'origin', branchName]);
  }

  /**
   * Create a PR using `gh` CLI (if available).
   */
  async createPR(
    repoRoot: string,
    title: string,
    body: string,
    baseBranch: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'create', '--title', title, '--body', body, '--base', baseBranch],
        { cwd: repoRoot }
      );
      const prUrl = stdout.trim();
      this.logger.log(`PR created: ${prUrl}`);
      return prUrl;
    } catch (err) {
      this.logger.warn(
        `Failed to create PR (gh CLI may not be available): ${(err as Error).message}`
      );
      return null;
    }
  }

  /**
   * Get repository changes: diff, staged diff, status, recent log, current branch.
   */
  async getChanges(repoRoot: string): Promise<{
    diff: string;
    status: string;
    log: string;
    branch: string;
  }> {
    const git = (args: string[]) =>
      execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

    const [headDiffRes, statusRes, logRes, branchRes] = await Promise.all([
      // git diff HEAD shows ALL changes (staged + unstaged) vs last commit
      git(['diff', 'HEAD']).catch(() => ({ stdout: '' })),
      git(['status', '--porcelain']).catch(() => ({ stdout: '' })),
      git(['log', '--oneline', '-20']).catch(() => ({ stdout: '' })),
      git(['branch', '--show-current']).catch(() => ({ stdout: '' })),
    ]);

    let diff = headDiffRes.stdout;

    // git diff HEAD doesn't include untracked files — generate diffs for them
    const untrackedFiles = statusRes.stdout
      .split('\n')
      .filter(line => line.startsWith('??'))
      .map(line => line.substring(3).trim());

    if (untrackedFiles.length > 0) {
      const untrackedDiffs: string[] = [];
      for (const file of untrackedFiles) {
        try {
          const content = await readFile(join(repoRoot, file), 'utf-8');
          const lines = content.split('\n');
          const header = [
            `diff --git a/${file} b/${file}`,
            'new file mode 100644',
            `--- /dev/null`,
            `+++ b/${file}`,
            `@@ -0,0 +1,${lines.length} @@`,
            ...lines.map(l => `+${l}`),
          ].join('\n');
          untrackedDiffs.push(header);
        } catch {
          // Skip binary or unreadable files
        }
      }
      if (untrackedDiffs.length > 0) {
        diff = diff + (diff ? '\n' : '') + untrackedDiffs.join('\n');
      }
    }

    return {
      diff,
      status: statusRes.stdout,
      log: logRes.stdout,
      branch: branchRes.stdout.trim(),
    };
  }

  /**
   * Stage all changes and commit with the given message.
   */
  async commitAll(repoRoot: string, message: string): Promise<{ hash: string }> {
    const git = (args: string[]) =>
      execFileAsync('git', args, { cwd: repoRoot });

    await git(['add', '-A']);
    const { stdout } = await git(['commit', '-m', message]);
    // Extract short hash from commit output (first line like "[branch abc1234] message")
    const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
    return { hash: match?.[1] ?? 'unknown' };
  }

  /**
   * Load project rules from the repo.
   * Reads `.aion/rules/*.md` files and `AION.md` from the repo root.
   * Returns concatenated content or null if no rules found.
   */
  async loadRules(repoRoot: string): Promise<string | null> {
    const sections: string[] = [];

    // 1. Read AION.md at repo root
    try {
      const rootRules = await readFile(join(repoRoot, 'AION.md'), 'utf-8');
      if (rootRules.trim()) {
        sections.push(rootRules.trim());
      }
    } catch {
      // File doesn't exist — ok
    }

    // 2. Read all .md files in .aion/rules/
    const rulesDir = join(repoRoot, '.aion', 'rules');
    try {
      await access(rulesDir);
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(rulesDir);
      const mdFiles = files.filter(f => f.endsWith('.md')).sort();

      for (const file of mdFiles) {
        try {
          const content = await readFile(join(rulesDir, file), 'utf-8');
          if (content.trim()) {
            sections.push(`<!-- ${file} -->\n${content.trim()}`);
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory doesn't exist — ok
    }

    return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
  }

  /**
   * Check if gh CLI is available.
   */
  async isGhAvailable(): Promise<boolean> {
    try {
      await execFileAsync('gh', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a title string to a URL-safe slug for branch names.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .slice(0, 60);                   // limit length
}
