import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { transform } from '@swc/core';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXTENSIONS = ['.js', '.mjs', '.cjs'];
const ALL_EXTENSIONS = [...TS_EXTENSIONS, ...JS_EXTENSIONS];

const JS_EXTENSION_TO_TS = {
  '.js': ['.ts', '.tsx', '.js'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

const transformCache = new Map();

function createCandidates(basePath) {
  const parsedExt = path.extname(basePath);
  const hasKnownExtension =
    parsedExt in JS_EXTENSION_TO_TS || ALL_EXTENSIONS.includes(parsedExt);
  const ext = hasKnownExtension ? parsedExt : '';
  const stem = ext ? basePath.slice(0, -ext.length) : basePath;
  const candidates = new Set();

  const extensions = ext ? (JS_EXTENSION_TO_TS[ext] ?? [ext]) : ALL_EXTENSIONS;

  for (const candidateExt of extensions) {
    candidates.add(`${stem}${candidateExt}`);
  }

  if (!ext) {
    for (const candidateExt of ALL_EXTENSIONS) {
      candidates.add(path.join(basePath, `index${candidateExt}`));
    }
  }

  return candidates;
}

function isPathLike(specifier) {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:')
  );
}

function resolvePathLikeSpecifier(specifier, parentURL) {
  if (!isPathLike(specifier)) {
    return undefined;
  }

  const [specifierWithoutQuery, queryString = ''] = specifier.split('?');
  const querySuffix = queryString ? `?${queryString}` : '';

  const parentPath = parentURL?.startsWith('file:')
    ? fileURLToPath(parentURL)
    : path.join(process.cwd(), 'index.js');

  const basePath = specifierWithoutQuery.startsWith('file:')
    ? fileURLToPath(specifierWithoutQuery)
    : path.isAbsolute(specifierWithoutQuery)
      ? specifierWithoutQuery
      : path.resolve(path.dirname(parentPath), specifierWithoutQuery);

  for (const candidate of createCandidates(basePath)) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return `${pathToFileURL(candidate).href}${querySuffix}`;
      }
    } catch {
      // ignore missing candidates
    }
  }

  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const resolvedUrl = resolvePathLikeSpecifier(specifier, context.parentURL);
    if (resolvedUrl) {
      return {
        url: resolvedUrl,
        shortCircuit: true,
      };
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  const [urlWithoutQuery] = url.split('?');

  if (!urlWithoutQuery.startsWith('file:')) {
    return nextLoad(url, context);
  }

  const filePath = fileURLToPath(urlWithoutQuery);
  if (!TS_EXTENSIONS.has(path.extname(filePath))) {
    return nextLoad(url, context);
  }

  const stat = await fs.promises.stat(filePath);
  const cached = transformCache.get(filePath);
  if (cached?.mtimeMs === stat.mtimeMs) {
    return {
      format: cached.format,
      source: cached.source,
      shortCircuit: true,
    };
  }

  const sourceText = await fs.promises.readFile(filePath, 'utf8');
  const isCommonJs = filePath.endsWith('.cts');
  const moduleType = isCommonJs ? 'commonjs' : 'es6';
  const tsx = filePath.endsWith('.tsx');

  let output;
  try {
    output = await transform(sourceText, {
      filename: filePath,
      sourceMaps: 'inline',
      module: { type: moduleType },
      jsc: {
        target: 'es2022',
        keepClassNames: true,
        experimental: { keepImportAttributes: true },
        parser: {
          syntax: 'typescript',
          tsx,
          decorators: true,
          dynamicImport: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
          react: tsx
            ? { runtime: 'automatic', importSource: 'react' }
            : undefined,
        },
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[swc-loader] Failed to compile ${filePath}\n${detail}`);
  }

  const source = output.code ?? '';
  const format = isCommonJs ? 'commonjs' : 'module';
  transformCache.set(filePath, { mtimeMs: stat.mtimeMs, source, format });

  return {
    format,
    source,
    shortCircuit: true,
  };
}
