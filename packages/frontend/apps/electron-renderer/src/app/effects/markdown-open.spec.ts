import { describe, expect, it } from 'vitest';

import {
  findWorkspaceForMarkdownFile,
  getMarkdownParentDirectory,
  getWorkspaceIdFromDiskSession,
  markdownPathsEqual,
  workspaceNeedsMarkdownSource,
} from './markdown-open-path';

describe('markdown open path matching', () => {
  it('matches files within the most specific configured workspace folder', () => {
    expect(
      findWorkspaceForMarkdownFile('/Users/me/Notes/work/plan.md', [
        { workspaceId: 'notes', folderPath: '/Users/me/Notes' },
        { workspaceId: 'work', folderPath: '/Users/me/Notes/work' },
        { workspaceId: 'other', folderPath: '/Users/me/Note' },
      ])
    ).toBe('work');
  });

  it('does not confuse sibling paths with a shared prefix', () => {
    expect(
      findWorkspaceForMarkdownFile('/Users/me/Notes-old/plan.md', [
        { workspaceId: 'notes', folderPath: '/Users/me/Notes' },
      ])
    ).toBeNull();
  });

  it('matches only the requested Markdown file in a multi-file folder', () => {
    expect(
      markdownPathsEqual('/Users/me/Notes/A.md', '/Users/me/Notes/A.md')
    ).toBe(true);
    expect(
      markdownPathsEqual('/Users/me/Notes/A.md', '/Users/me/Notes/B.md')
    ).toBe(false);
  });

  it('does not reuse a single-file workspace binding for a sibling file', () => {
    const workspaces = [
      {
        workspaceId: 'single-file',
        folderPath: '/Users/me/Notes',
        sourceFile: '/Users/me/Notes/A.md',
      },
    ];

    expect(
      findWorkspaceForMarkdownFile('/Users/me/Notes/A.md', workspaces)
    ).toBe('single-file');
    expect(
      findWorkspaceForMarkdownFile('/Users/me/Notes/B.md', workspaces)
    ).toBeNull();
  });

  it('migrates folder-only and sibling bindings to the requested source file', () => {
    expect(
      workspaceNeedsMarkdownSource('/Users/me/Notes/A.md', undefined)
    ).toBe(true);
    expect(
      workspaceNeedsMarkdownSource(
        '/Users/me/Notes/A.md',
        '/Users/me/Notes/B.md'
      )
    ).toBe(true);
    expect(
      workspaceNeedsMarkdownSource(
        '/Users/me/Notes/A.md',
        '/Users/me/Notes/A.md'
      )
    ).toBe(false);
  });

  it('returns the containing folder for macOS and Windows paths', () => {
    expect(getMarkdownParentDirectory('/Users/me/Notes/plan.md')).toBe(
      '/Users/me/Notes'
    );
    expect(getMarkdownParentDirectory('C:\\Notes\\plan.md')).toBe('C:/Notes');
  });

  it('reads the workspace id from a disk session', () => {
    expect(
      getWorkspaceIdFromDiskSession(
        JSON.stringify([
          '@peer(local);@type(workspace);@id(workspace-a);',
          '/Users/me/Notes',
        ])
      )
    ).toBe('workspace-a');
    expect(getWorkspaceIdFromDiskSession('invalid')).toBeNull();
  });
});
