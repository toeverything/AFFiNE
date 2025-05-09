export type Template = {
  /**
   * name of the sticker
   *
   * if not provided, it cannot be searched
   */
  name?: string;

  /**
   * template content
   */
  content: unknown;

  /**
   * external assets
   */
  assets?: Record<string, string>;

  preview?: string;

  /**
   * type of template
   * `template`: normal template, looks like an article
   * `sticker`: sticker template, only contains one image block under surface block
   */
  type: 'template' | 'sticker';
};

export type TemplateCategory = {
  name: string;
  templates: Template[] | (() => Promise<Template[]>);
};

export interface TemplateManager {
  list(category: string): Promise<Template[]> | Template[];

  categories(): Promise<string[]> | string[];

  search(keyword: string, category?: string): Promise<Template[]> | Template[];

  extend?(manager: TemplateManager): void;
}
