import { I18n } from '@affine/i18n';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { Boxed } from '@blocksuite/affine/store';
import {
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { PresentationIcon } from '@blocksuite/icons/lit';

import { CHART_WIDGET_SIZE, WHITEBOARD_FLAVOURS } from '../../const';
import { insertGfxWidget } from '../../insert-widget';
import { dataSourceFromDatabase, findNearbyDatabaseId } from './databases';
import { ChartBlockSchema } from './model';

const flavour = ChartBlockSchema.model.flavour;

const chartSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    const enabled =
      std.store.schema.flavourSchemaMap.has(flavour) &&
      std.get(FeatureFlagService).getFlag('enable_whiteboard_chart') &&
      !std.store.readonly;

    return [
      {
        name: I18n['com.affine.whiteboard.chart.slash-name'](),
        description: I18n['com.affine.whiteboard.chart.slash-description'](),
        icon: PresentationIcon(),
        searchAlias: [
          'chart',
          'graph',
          'echarts',
          'wb:chart',
          'график',
          'диаграмма',
        ],
        group: '4_Content & Media@13',
        when: () => enabled,
        action: ({ std }) => {
          insertGfxWidget(std, flavour, {}, CHART_WIDGET_SIZE);
        },
      },
      {
        name: I18n['com.affine.whiteboard.chart.from-table'](),
        description:
          I18n['com.affine.whiteboard.chart.from-table-description'](),
        icon: PresentationIcon(),
        searchAlias: [
          'chart from table',
          'график из таблицы',
          'database chart',
        ],
        group: '4_Content & Media@14',
        when: () => enabled && !!findNearbyDatabaseId(std.store, model.id),
        action: ({ std, model }) => {
          const blockId = findNearbyDatabaseId(std.store, model.id);
          if (!blockId) {
            insertGfxWidget(std, flavour, {}, CHART_WIDGET_SIZE);
            return;
          }
          insertGfxWidget(
            std,
            flavour,
            {
              dataSource: new Boxed(dataSourceFromDatabase(std.store, blockId)),
            },
            CHART_WIDGET_SIZE
          );
        },
      },
    ];
  },
};

export const ChartSlashMenuConfigExtension = SlashMenuConfigExtension(
  WHITEBOARD_FLAVOURS.chart,
  chartSlashMenuConfig
);
