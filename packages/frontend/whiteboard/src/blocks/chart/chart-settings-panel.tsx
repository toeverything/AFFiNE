import { I18n } from '@affine/i18n';
import { useCallback, type ChangeEvent } from 'react';

import {
  CHART_DATA_SOURCE_TYPES,
  CHART_FORMATTERS,
  CHART_TYPES,
  type ChartDataSource,
  type ChartDataSourceType,
  type ChartFormatterPreset,
  type ChartType,
  type ChartDatabaseOption,
  type ChartVisualSpec,
} from './types';

export type ChartSettingsPanelProps = {
  title: string;
  chartType: ChartType;
  spec: ChartVisualSpec;
  dataSource: ChartDataSource;
  databases: ChartDatabaseOption[];
  onTitleChange: (title: string) => void;
  onTypeChange: (type: ChartType) => void;
  onSpecChange: (spec: ChartVisualSpec) => void;
  onDataSourceChange: (source: ChartDataSource) => void;
};

const TYPE_LABEL: Record<ChartType, () => string> = {
  bar: () => I18n['com.affine.whiteboard.chart.type.bar'](),
  line: () => I18n['com.affine.whiteboard.chart.type.line'](),
  area: () => I18n['com.affine.whiteboard.chart.type.area'](),
  pie: () => I18n['com.affine.whiteboard.chart.type.pie'](),
  scatter: () => I18n['com.affine.whiteboard.chart.type.scatter'](),
  funnel: () => I18n['com.affine.whiteboard.chart.type.funnel'](),
  radar: () => I18n['com.affine.whiteboard.chart.type.radar'](),
  heatmap: () => I18n['com.affine.whiteboard.chart.type.heatmap'](),
};

const SOURCE_LABEL: Record<ChartDataSourceType, () => string> = {
  database: () => I18n['com.affine.whiteboard.chart.source.database'](),
  inline: () => I18n['com.affine.whiteboard.chart.source.inline'](),
  'csv-blob': () => I18n['com.affine.whiteboard.chart.source.csv-blob'](),
  http: () => I18n['com.affine.whiteboard.chart.source.http'](),
};

const FORMATTER_LABEL: Record<ChartFormatterPreset, () => string> = {
  number: () => I18n['com.affine.whiteboard.chart.formatter.number'](),
  percent: () => I18n['com.affine.whiteboard.chart.formatter.percent'](),
  compact: () => I18n['com.affine.whiteboard.chart.formatter.compact'](),
  date: () => I18n['com.affine.whiteboard.chart.formatter.date'](),
};

function typeLabel(type: ChartType) {
  return TYPE_LABEL[type]();
}

function sourceLabel(type: ChartDataSourceType) {
  return SOURCE_LABEL[type]();
}

export function ChartSettingsPanel({
  title,
  chartType,
  spec,
  dataSource,
  databases,
  onTitleChange,
  onTypeChange,
  onSpecChange,
  onDataSourceChange,
}: ChartSettingsPanelProps) {
  const selectedDb = databases.find(item => item.id === dataSource.blockId);
  const columns = selectedDb?.columns ?? [];

  const updateSource = useCallback(
    (patch: Partial<ChartDataSource>) => {
      onDataSourceChange({ ...dataSource, ...patch });
    },
    [dataSource, onDataSourceChange]
  );

  const onYChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const y = Array.from(event.currentTarget.selectedOptions).map(
      option => option.value
    );
    updateSource({
      mapping: { ...dataSource.mapping, y },
    });
  };

  return (
    <div className="wb-chart-settings">
      <h3>{I18n['com.affine.whiteboard.chart.panel.title']()}</h3>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.chart-title']()}
        <input
          value={title}
          onChange={event => onTitleChange(event.currentTarget.value)}
        />
      </label>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.type']()}
        <select
          value={chartType}
          onChange={event => onTypeChange(event.currentTarget.value as ChartType)}
        >
          {CHART_TYPES.map(type => (
            <option value={type} key={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
      </label>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.source']()}
        <select
          value={dataSource.type}
          onChange={event =>
            updateSource({
              type: event.currentTarget.value as ChartDataSourceType,
            })
          }
        >
          {CHART_DATA_SOURCE_TYPES.map(type => (
            <option value={type} key={type}>
              {sourceLabel(type)}
            </option>
          ))}
        </select>
      </label>

      {dataSource.type === 'database' ? (
        <label>
          {I18n['com.affine.whiteboard.chart.panel.database']()}
          <select
            value={dataSource.blockId ?? ''}
            onChange={event => {
              const next = databases.find(
                item => item.id === event.currentTarget.value
              );
              updateSource({
                blockId: next?.id,
                docId: next?.docId,
                mapping: {
                  x: next?.columns[0]?.id ?? dataSource.mapping.x,
                  y: next?.columns.slice(1).map(column => column.id) ?? [],
                },
              });
            }}
          >
            <option value="">
              {I18n['com.affine.whiteboard.chart.panel.database-empty']()}
            </option>
            {databases.map(item => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {dataSource.type === 'http' ? (
        <>
          <label>
            {I18n['com.affine.whiteboard.chart.panel.url']()}
            <input
              value={dataSource.url ?? ''}
              onChange={event =>
                updateSource({ url: event.currentTarget.value })
              }
            />
          </label>
          <label>
            {I18n['com.affine.whiteboard.chart.panel.allowlist']()}
            <input
              value={(dataSource.httpAllowlist ?? []).join(', ')}
              onChange={event =>
                updateSource({
                  httpAllowlist: event.currentTarget.value
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            {I18n['com.affine.whiteboard.chart.panel.refresh']()}
            <input
              type="number"
              min={0}
              value={dataSource.refreshMs ?? 0}
              onChange={event =>
                updateSource({
                  refreshMs: Number(event.currentTarget.value) || undefined,
                })
              }
            />
          </label>
        </>
      ) : null}

      {dataSource.type === 'csv-blob' ? (
        <label>
          {I18n['com.affine.whiteboard.chart.panel.blob-id']()}
          <input
            value={dataSource.blobId ?? ''}
            onChange={event =>
              updateSource({ blobId: event.currentTarget.value })
            }
          />
        </label>
      ) : null}

      {dataSource.type === 'inline' ? (
        <label>
          {I18n['com.affine.whiteboard.chart.panel.inline']()}
          <textarea
            value={(dataSource.inline?.rows ?? [])
              .map(row => row.join(','))
              .join('\n')}
            onChange={event => {
              const rows = event.currentTarget.value.split('\n').map(line =>
                line.split(',').map(cell => {
                  const trimmed = cell.trim();
                  const numeric = Number(trimmed);
                  return trimmed !== '' && Number.isFinite(numeric)
                    ? numeric
                    : trimmed;
                })
              );
              updateSource({
                inline: {
                  columns: dataSource.inline?.columns ?? [],
                  rows,
                },
              });
            }}
          />
        </label>
      ) : null}

      <label>
        {I18n['com.affine.whiteboard.chart.panel.x-axis']()}
        <select
          value={dataSource.mapping.x}
          onChange={event =>
            updateSource({
              mapping: { ...dataSource.mapping, x: event.currentTarget.value },
            })
          }
        >
          {(dataSource.type === 'database' ? columns : []).map(column => (
            <option value={column.id} key={column.id}>
              {column.name}
            </option>
          ))}
          {dataSource.type !== 'database'
            ? (dataSource.inline?.columns ?? []).map(column => (
                <option value={column} key={column}>
                  {column}
                </option>
              ))
            : null}
        </select>
      </label>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.y-axis']()}
        <select
          multiple
          value={dataSource.mapping.y}
          onChange={onYChange}
        >
          {(dataSource.type === 'database' ? columns : []).map(column => (
            <option value={column.id} key={column.id}>
              {column.name}
            </option>
          ))}
          {dataSource.type !== 'database'
            ? (dataSource.inline?.columns ?? []).map(column => (
                <option value={column} key={column}>
                  {column}
                </option>
              ))
            : null}
        </select>
      </label>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.colors']()}
        <input
          value={(spec.colors ?? []).join(', ')}
          onChange={event =>
            onSpecChange({
              ...spec,
              colors: event.currentTarget.value
                .split(',')
                .map(item => item.trim())
                .filter(Boolean),
            })
          }
        />
      </label>

      <label>
        {I18n['com.affine.whiteboard.chart.panel.formatter']()}
        <select
          value={spec.formatter ?? 'number'}
          onChange={event =>
            onSpecChange({
              ...spec,
              formatter: event.currentTarget.value as ChartFormatterPreset,
            })
          }
        >
          {CHART_FORMATTERS.map(item => (
            <option value={item} key={item}>
              {FORMATTER_LABEL[item]()}
            </option>
          ))}
        </select>
      </label>

      <div className="wb-chart-settings__row">
        <span>{I18n['com.affine.whiteboard.chart.panel.legend']()}</span>
        <input
          type="checkbox"
          checked={spec.legend !== false}
          onChange={event =>
            onSpecChange({ ...spec, legend: event.currentTarget.checked })
          }
        />
      </div>

      <div className="wb-chart-settings__row">
        <span>{I18n['com.affine.whiteboard.chart.panel.labels']()}</span>
        <input
          type="checkbox"
          checked={!!spec.labels}
          onChange={event =>
            onSpecChange({ ...spec, labels: event.currentTarget.checked })
          }
        />
      </div>
    </div>
  );
}
