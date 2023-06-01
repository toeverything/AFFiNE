import type { Element } from 'cheerio';

export type MetaData = {
  title?: string;
  description?: string;
  icon?: string;
  image?: string;
  keywords?: string[];
  language?: string;
  type?: string;
  url?: string;
  provider?: string;

  [x: string]: string | string[] | undefined;
};

export type MetadataRule = [string, (el: Element) => string | null];

export type Context = {
  url: string;
} & GetMetaDataOptions;

export type RuleSet = {
  rules: MetadataRule[];
  defaultValue?: (context: Context) => string | string[];
  scorer?: (el: Element, score: any) => any;
  processor?: (input: any, context: Context) => any;
};

export type GetMetaDataOptions = {
  customRules?: Record<string, RuleSet>;
  forceImageHttps?: boolean;
};

export type GetHTMLOptions = {
  timeout?: number;
  shouldReGetHTML?: (currentHTML: string) => boolean | Promise<boolean>;
};

export type Options = {
  shouldReGetHTML?: (metaData: MetaData) => boolean | Promise<boolean>;
} & GetMetaDataOptions &
  Omit<GetHTMLOptions, 'shouldReGetHTML'>;
