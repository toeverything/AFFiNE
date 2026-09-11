import type { BlockHtmlAdapterMatcher } from '@blocksuite/affine/shared/adapters';
import { BlockHtmlAdapterExtension } from '@blocksuite/affine/shared/adapters';

import { ChartBlockSchema } from './model';

export const chartBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: ChartBlockSchema.model.flavour,
  toMatch: o =>
    'tagName' in o.node &&
    (o.node as { tagName?: string }).tagName === 'figure' &&
    (o.node as { properties?: { dataWbChart?: string } }).properties
      ?.dataWbChart === 'true',
  fromMatch: o => o.node.flavour === ChartBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const title =
        typeof o.node.props.title === 'string'
          ? o.node.props.title
          : ((
              o.node.props.title as { toString?: () => string } | undefined
            )?.toString?.() ?? 'Chart');
      const chartType =
        typeof o.node.props.chartType === 'string'
          ? o.node.props.chartType
          : 'bar';

      context.walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {
              dataWbChart: 'true',
              dataChartType: chartType,
            },
            children: [
              {
                type: 'element',
                tagName: 'figcaption',
                properties: {},
                children: [{ type: 'text', value: title }],
              },
            ],
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const ChartBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  chartBlockHtmlAdapterMatcher
);
