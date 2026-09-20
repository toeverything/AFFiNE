// https://vitepress.dev/guide/custom-theme
import 'vitepress-plugin-sandpack/dist/style.css';
import './style.css';

import Theme from 'vitepress/theme';
import { h } from 'vue';

import BlogListLayout from './components/blog-list-layout.vue';
import BlogPostMeta from './components/blog-post-meta.vue';
import CodeSandbox from './components/code-sandbox.vue';
import HeroLogo from './components/hero-logo.vue';
import Icon from './components/icon.vue';

export default {
  ...Theme,
  Layout: () => {
    return h(Theme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      'home-hero-image': () => h(HeroLogo),
      // 'home-features-after': () => h(Playground),
    });
  },
  enhanceApp({ app }) {
    app.component('Icon', Icon);
    app.component('BlogListLayout', BlogListLayout);
    app.component('BlogPostMeta', BlogPostMeta);
    app.component('CodeSandbox', CodeSandbox);
  },
};
