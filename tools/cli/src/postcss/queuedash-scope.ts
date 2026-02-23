import type { AtRule, Container, Node, PluginCreator, Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

export interface QueuedashScopeOptions {
  scopeClass?: string;
}

function normalizeFilePath(filePath: string) {
  return filePath.replaceAll('\\', '/').split('?')[0];
}

function isInKeyframes(rule: Rule) {
  let parent: Node | undefined = rule.parent;
  while (parent) {
    if (parent.type === 'atrule') {
      const name = (parent as AtRule).name?.toLowerCase();
      if (name && name.endsWith('keyframes')) {
        return true;
      }
    }
    parent = parent.parent;
  }
  return false;
}

const DEFAULT_SCOPE_CLASS = 'affine-queuedash';

export const queuedashScopePostcssPlugin: PluginCreator<
  QueuedashScopeOptions
> = (options = {}) => {
  const scopeClass = options.scopeClass ?? DEFAULT_SCOPE_CLASS;
  const scopeSelector = `:where(.${scopeClass})`;

  const scopeAst = selectorParser().astSync(scopeSelector);
  const scopeNodes = scopeAst.nodes[0]?.nodes;

  if (!scopeNodes) {
    throw new Error(
      `[queuedashScopePostcssPlugin] Failed to parse scope selector: ${scopeSelector}`
    );
  }

  const scopeProcessor = selectorParser(selectors => {
    selectors.each(selector => {
      const raw = selector.toString().trim();

      if (
        raw.startsWith(scopeSelector) ||
        raw.startsWith(`.${scopeClass}`) ||
        raw.startsWith(`:where(.${scopeClass})`)
      ) {
        return;
      }

      if (
        raw === 'html' ||
        raw === 'body' ||
        raw === ':host' ||
        raw === ':root'
      ) {
        selector.nodes = scopeNodes.map(node => node.clone());
        return;
      }

      const prefixNodes = scopeNodes.map(node => node.clone());
      const space = selectorParser.combinator({ value: ' ' });
      selector.nodes = [...prefixNodes, space, ...selector.nodes];
    });
  });

  return {
    postcssPlugin: 'affine-queuedash-scope',
    Once(root, { result }) {
      const from =
        root.source?.input.file ||
        root.source?.input.from ||
        result.opts.from ||
        '';

      const normalized = from ? normalizeFilePath(from) : '';
      const isQueuedashVendorCss = normalized.endsWith(
        '/@queuedash/ui/dist/styles.css'
      );

      const queuedashLayers: AtRule[] = [];
      root.walkAtRules('layer', atRule => {
        if (atRule.params?.trim() === 'queuedash' && atRule.nodes?.length) {
          queuedashLayers.push(atRule);
        }
      });

      if (!isQueuedashVendorCss && queuedashLayers.length === 0) {
        return;
      }

      const targets: Container[] =
        queuedashLayers.length > 0 ? queuedashLayers : [root];

      targets.forEach(container => {
        container.walkRules(rule => {
          if (!rule.selector || isInKeyframes(rule)) {
            return;
          }
          rule.selector = scopeProcessor.processSync(rule.selector);
        });
      });
    },
  };
};

queuedashScopePostcssPlugin.postcss = true;
