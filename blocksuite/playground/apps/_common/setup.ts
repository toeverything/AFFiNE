import type {
  Template,
  TemplateCategory,
  TemplateManager,
} from '@blocksuite/affine/gfx/template';
import { EdgelessTemplatePanel } from '@blocksuite/affine/gfx/template';

export function setupEdgelessTemplate() {
  const playgroundTemplates = [
    {
      name: 'Paws and pals',
      templates: () =>
        import('./templates/stickers.js').then(module => module.default),
    },
  ] as TemplateCategory[];

  function lcs(text1: string, text2: string): number {
    const dp: number[][] = Array.from(
      {
        length: text1.length + 1,
      },
      () => Array.from({ length: text2.length + 1 }, () => 0)
    );

    for (let i = 1; i <= text1.length; i++) {
      for (let j = 1; j <= text2.length; j++) {
        if (text1[i - 1] === text2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[text1.length][text2.length];
  }

  EdgelessTemplatePanel.templates.extend({
    search: async (keyword: string) => {
      const candidates: Template[] = [];

      await Promise.all(
        playgroundTemplates.map(async cate => {
          const templates =
            cate.templates instanceof Function
              ? await cate.templates()
              : cate.templates;

          templates.forEach(template => {
            if (
              template.name &&
              lcs(template.name, keyword) === keyword.length
            ) {
              candidates.push(template);
            }
          });
        })
      );

      return candidates;
    },
    list: async (cate: string) => {
      const category = playgroundTemplates.find(c => c.name === cate);

      if (category?.templates instanceof Function) {
        return category.templates();
      }

      return category?.templates ?? [];
    },

    categories: () => playgroundTemplates.map(cate => cate.name),
  } satisfies TemplateManager);
}
