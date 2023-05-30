import type { Element } from 'cheerio';

export interface MetaData {
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
}

export type MetadataRule = [string, (el: Element) => string | null];

export interface Context {
  url: string;
  options: Options;
}

export interface RuleSet {
  rules: MetadataRule[];
  defaultValue?: (context: Context) => string | string[];
  scorer?: (el: Element, score: any) => any;
  processor?: (input: any, context: Context) => any;
}

export interface Options {
  maxRedirects?: number;
  ua?: string;
  lang?: string;
  timeout?: number;
  forceImageHttps?: boolean;
  html?: string;
  url?: string;
  customRules?: Record<string, RuleSet>;
}
