import fs from 'node:fs';
import path from 'node:path';

import {
  type MermaidRenderRequest,
  type MermaidRenderResult,
  renderMermaidSvg,
  renderTypstSvg,
  type TypstRenderRequest,
  type TypstRenderResult,
} from '@affine/native';

const TYPST_FONT_DIRS_ENV = 'AFFINE_TYPST_FONT_DIRS';

function parseTypstFontDirsFromEnv() {
  const value = process.env[TYPST_FONT_DIRS_ENV];
  if (!value) {
    return [];
  }

  return value
    .split(path.delimiter)
    .map(dir => dir.trim())
    .filter(Boolean);
}

function getTypstFontDirCandidates() {
  const resourcesPath = process.resourcesPath ?? '';

  return [
    ...parseTypstFontDirsFromEnv(),
    path.join(resourcesPath, 'fonts'),
    path.join(resourcesPath, 'js', 'fonts'),
    path.join(resourcesPath, 'app.asar.unpacked', 'fonts'),
    path.join(resourcesPath, 'app.asar.unpacked', 'js', 'fonts'),
  ];
}

function resolveTypstFontDirs() {
  return Array.from(
    new Set(getTypstFontDirCandidates().map(dir => path.resolve(dir)))
  ).filter(dir => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory());
}

function withTypstFontDirs(
  request: TypstRenderRequest,
  fontDirs: string[]
): TypstRenderRequest {
  const nextOptions = request.options ? { ...request.options } : {};
  if (!nextOptions.fontDirs?.length) {
    nextOptions.fontDirs = fontDirs;
  }
  return { ...request, options: nextOptions };
}

const typstFontDirs = resolveTypstFontDirs();

export const previewHandlers = {
  renderMermaidSvg: async (
    request: MermaidRenderRequest
  ): Promise<MermaidRenderResult> => {
    return renderMermaidSvg(request);
  },
  renderTypstSvg: async (
    request: TypstRenderRequest
  ): Promise<TypstRenderResult> => {
    return renderTypstSvg(withTypstFontDirs(request, typstFontDirs));
  },
};
