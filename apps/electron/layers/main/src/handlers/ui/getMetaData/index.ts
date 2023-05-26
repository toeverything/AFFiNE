import type { CheerioAPI, Element } from 'cheerio';
import { load } from 'cheerio';
import got from 'got';

import type { Context, MetaData, Options, RuleSet } from './types';

export * from './types';

import { metaDataRules } from './rules';

const defaultOptions = {
  maxRedirects: 5,
  ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  lang: '*',
  timeout: 10000,
  forceImageHttps: true,
  customRules: {},
};

const runRule = function (ruleSet: RuleSet, $: CheerioAPI, context: Context) {
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
};

const getMetaData = async function (
  input: string | Partial<Options>,
  inputOptions: Partial<Options> = {}
) {
  let url;
  if (typeof input === 'object') {
    inputOptions = input;
    url = input.url || '';
  } else {
    url = input;
  }

  const options = Object.assign({}, defaultOptions, inputOptions);

  const rules: Record<string, RuleSet> = { ...metaDataRules };
  Object.keys(options.customRules).forEach((key: string) => {
    rules[key] = {
      rules: [...metaDataRules[key].rules, ...options.customRules[key].rules],
      defaultValue:
        options.customRules[key].defaultValue ||
        metaDataRules[key].defaultValue,
      processor:
        options.customRules[key].processor || metaDataRules[key].processor,
    };
  });

  let html;
  if (!options.html) {
    const response = await got(url, {
      headers: {
        'User-Agent': options.ua,
        'Accept-Language': options.lang,
      },
      timeout: options.timeout,
      ...(options.maxRedirects === 0
        ? { followRedirect: false }
        : { maxRedirects: options.maxRedirects }),
    });
    html = response.body;
  } else {
    html = options.html;
  }

  const metadata: MetaData = {};
  const context: Context = {
    url,
    options,
  };

  const $ = load(html);
  // console.log('===============================');
  // console.log('html');
  // console.log(doc);

  Object.keys(rules).forEach((key: string) => {
    const ruleSet = rules[key];
    metadata[key] = runRule(ruleSet, $, context) || undefined;
  });

  return metadata;
};

export default getMetaData;
