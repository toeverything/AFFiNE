import { I18n } from '@affine/i18n';
import { useCallback, type ChangeEvent } from 'react';

import type { BoardColumnPreview } from './column-snapshot';
import type { BoardLanePreview } from './grid';
import type { BoardGroupByAxes, BoardWipLimits } from './semantics';

export type BoardPropertyOption = {
  id: string;
  name: string;
};

export type BoardSettingsPanelProps = {
  axes: BoardGroupByAxes;
  laneProperties: BoardPropertyOption[];
  columns: BoardColumnPreview[];
  lanes: BoardLanePreview[];
  wipLimits: BoardWipLimits;
  laneFilter?: string;
  onAxesChange: (axes: BoardGroupByAxes) => void;
  onWipChange: (limits: BoardWipLimits) => void;
  onLaneFilterChange: (laneId: string) => void;
};

export function BoardSettingsPanel({
  axes,
  laneProperties,
  columns,
  lanes,
  wipLimits,
  laneFilter,
  onAxesChange,
  onWipChange,
  onLaneFilterChange,
}: BoardSettingsPanelProps) {
  const setY = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onAxesChange({ ...axes, y: event.target.value || undefined });
    },
    [axes, onAxesChange]
  );

  return (
    <div className="wb-board-settings">
      <h3>{I18n['com.affine.whiteboard.board.settings']()}</h3>
      <label>
        {I18n['com.affine.whiteboard.board.swimlanes']()}
        <select value={axes.y ?? ''} onChange={setY}>
          <option value="">
            {I18n['com.affine.whiteboard.board.swimlane-none']()}
          </option>
          {laneProperties.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {I18n['com.affine.whiteboard.board.filter-lane']()}
        <select
          value={laneFilter ?? ''}
          onChange={event => onLaneFilterChange(event.target.value)}
        >
          <option value="">
            {I18n['com.affine.whiteboard.board.filter-all']()}
          </option>
          {lanes.map(lane => (
            <option key={lane.id || 'ungrouped'} value={lane.id}>
              {lane.name || I18n['com.affine.whiteboard.board.unassigned']()}
            </option>
          ))}
        </select>
      </label>
      <p className="wb-board-settings__hint">
        {I18n['com.affine.whiteboard.board.settings-filters']()}
      </p>
      <h3>{I18n['com.affine.whiteboard.board.wip-limit']()}</h3>
      {columns.map(column => (
        <label key={column.id}>
          {column.name || I18n['com.affine.whiteboard.board.ungrouped']()}
          <input
            type="number"
            min={0}
            value={wipLimits[column.id] ?? ''}
            placeholder="—"
            onChange={event => {
              const next = { ...wipLimits };
              const value = Number(event.target.value);
              if (!event.target.value || !Number.isFinite(value) || value <= 0) {
                delete next[column.id];
              } else {
                next[column.id] = value;
              }
              onWipChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
