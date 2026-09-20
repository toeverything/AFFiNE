import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitepress';
import { renderSandbox } from 'vitepress-plugin-sandpack';

import { components, guide, reference } from './sidebar';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  // FIXME: remove dead links
  ignoreDeadLinks: true,

  title: 'BlockSuite',
  description: 'Content Editing Tech Stack for the Web',
  vite: {
    build: {
      target: 'ES2022',
    },
    plugins: [
      wasm(),
      {
        name: 'redirect-plugin',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/blocksuite-overview.html') {
              res.writeHead(301, { Location: '/guide/overview.html' });
              res.end();
            } else {
              next();
            }
          });
        },
      },
    ],
  },
  lang: 'en-US',
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: 'https://raw.githubusercontent.com/toeverything/blocksuite/master/assets/logo.svg',
      },
    ],
    ['meta', { property: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      {
        property: 'twitter:image',
        content:
          'https://raw.githubusercontent.com/toeverything/blocksuite/master/packages/docs/images/blocksuite-cover.jpg',
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content:
          'https://raw.githubusercontent.com/toeverything/blocksuite/master/packages/docs/images/blocksuite-cover.jpg',
      },
    ],
  ],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    outline: [2, 3],

    nav: [
      {
        text: 'Components',
        link: '/components/overview',
        activeMatch: '/components/*',
      },
      {
        text: 'Framework',
        link: '/guide/overview',
        activeMatch: '/guide/*',
      },
      {
        text: 'Playground',
        link: 'https://try-blocksuite.vercel.app/?init',
      },
      {
        text: 'More',
        items: [
          { text: 'Blog', link: '/blog/', activeMatch: '/blog/*' },
          {
            text: 'API',
            link: '/api/',
            activeMatch: '/api/*',
          },
          {
            text: 'Releases',
            link: 'https://github.com/toeverything/blocksuite/releases',
          },
        ],
      },
    ],

    sidebar: {
      '/guide/': { base: '/', items: guide },
      '/api/': { base: '/', items: reference },
      '/components/': { base: '/', items: components },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/toeverything/blocksuite' },
      {
        icon: {
          svg: '<svg role="img" xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path fill="#777777" d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>',
        },
        link: 'https://twitter.com/AffineDev',
      },
    ],

    footer: {
      copyright: 'Copyright © 2022-present Toeverything',
    },

    search: {
      provider: 'local',
      options: {
        _render(src, env, md) {
          if (env.relativePath.startsWith('api/')) {
            return '';
          }
          return md.render(src, env);
        },
      },
    },
  },
  markdown: {
    config(md) {
      md.use(container, 'code-sandbox', {
        render(tokens, idx) {
          return renderSandbox(tokens, idx, 'code-sandbox');
        },
      });
      rewriteApiMemberLinks(md);
    },
  },
});

const apiMemberLinkPattern =
  /^\/api\/@blocksuite\/(.+)\/(?:classes|enumerations|functions|interfaces|type-aliases|variables)\/([^/?#]+)(?:\.html)?((?:\?[^#]*)?(?:#.*)?)?$/;

function rewriteApiMemberLinks(md: MarkdownIt) {
  const apiMemberTargets = getApiMemberTargets();
  const defaultRender =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');

    if (hrefIndex >= 0 && token.attrs) {
      token.attrs[hrefIndex][1] = rewriteApiMemberLink(
        token.attrs[hrefIndex][1],
        apiMemberTargets
      );
    }

    return defaultRender(tokens, idx, options, env, self);
  };
}

function rewriteApiMemberLink(
  href: string,
  apiMemberTargets: Map<string, string>
) {
  const match = href.match(apiMemberLinkPattern);

  if (!match) {
    return href;
  }

  const [, packagePath, memberFileName, suffix = ''] = match;
  const target = apiMemberTargets.get(decodeURIComponent(memberFileName));

  if (target) {
    return `${target}${suffix}`;
  }

  return `/api/@blocksuite/${packagePath}.html${suffix}`;
}

function getApiMemberTargets() {
  const apiDir = join(process.cwd(), 'api');
  const targets = new Map<string, string>();

  if (!existsSync(apiDir)) {
    return targets;
  }

  for (const file of findMarkdownFiles(apiDir)) {
    const route = `/api/${relative(apiDir, file)
      .replace(/\.md$/, '.html')
      .split(sep)
      .join('/')}`;

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const member = line.match(/^### (.+)$/);

      if (!member) {
        continue;
      }

      const name = getApiMemberName(member[1]);

      if (name && !targets.has(name)) {
        targets.set(name, route);
      }
    }
  }

  return targets;
}

function findMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return findMarkdownFiles(path);
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function getApiMemberName(heading: string) {
  return heading
    .replaceAll('`', '')
    .replace(/\\([<>])/g, '$1')
    .replace(/^(abstract|readonly)\s+/, '')
    .replace(/\(\)$/, '')
    .replace(/<.*>$/, '')
    .trim();
}
