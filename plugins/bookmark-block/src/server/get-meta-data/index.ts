import type { CheerioAPI, Element } from 'cheerio';
import { load } from 'cheerio';

import type { Context, MetaData, Options, RuleSet } from './types';

export * from './types';

import { getHTMLByURL } from './get-html';
import { metaDataRules } from './rules';
import type { GetMetaDataOptions } from './types';

function runRule(ruleSet: RuleSet, $: CheerioAPI, context: Context) {
  let maxScore = 0;
  let value;

  for (let currRule = 0; currRule < ruleSet.rules.length; currRule++) {
    const [query, handler] = ruleSet.rules[currRule];
    const elements = Array.from($(query));

    if (elements.length) {
      for (const element of elements) {
        let score = ruleSet.rules.length - currRule;

        if (ruleSet.scorer) {
          const newScore = ruleSet.scorer(element as Element, score);

          if (newScore) {
            score = newScore;
          }
        }

        if (score > maxScore) {
          maxScore = score;
          value = handler(element as Element);
        }
      }
    }
  }

  if (value) {
    if (ruleSet.processor) {
      value = ruleSet.processor(value, context);
    }

    return value;
  }

  if (ruleSet.defaultValue) {
    return ruleSet.defaultValue(context);
  }

  return undefined;
}

async function getMetaDataByHTML(
  html: string,
  url: string,
  options: GetMetaDataOptions
) {
  const { customRules = {} } = options;
  const rules: Record<string, RuleSet> = { ...metaDataRules };
  Object.keys(customRules).forEach((key: string) => {
    rules[key] = {
      rules: [...metaDataRules[key].rules, ...customRules[key].rules],
      defaultValue:
        customRules[key].defaultValue || metaDataRules[key].defaultValue,
      processor: customRules[key].processor || metaDataRules[key].processor,
    };
  });

  const metadata: MetaData = {};
  const context: Context = {
    url,
    ...options,
  };

  const $ = load(html);

  Object.keys(rules).forEach((key: string) => {
    const ruleSet = rules[key];
    metadata[key] = runRule(ruleSet, $, context) || undefined;
  });

  return metadata;
}

export async function getMetaData(url: string, options: Options = {}) {
  const { customRules, forceImageHttps, shouldReGetHTML, ...other } = options;
  const html = await getHTMLByURL(url, {
    ...other,
    shouldReGetHTML: async html => {
      const meta = await getMetaDataByHTML(html, url, {
        customRules,
        forceImageHttps,
      });
      return shouldReGetHTML ? await shouldReGetHTML(meta) : false;
    },
  }).catch(() => {
    //   TODO: report error
    return '';
  });

  return await getMetaDataByHTML(html, url, {
    customRules,
    forceImageHttps,
  });
}
