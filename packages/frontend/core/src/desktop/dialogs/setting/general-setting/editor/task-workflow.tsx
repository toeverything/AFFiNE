import {
  Menu,
  MenuItem,
  type MenuProps,
  MenuTrigger,
  RowInput,
  Switch,
} from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import type { TaskWorkflowDefaults } from '@blocksuite/affine/shared/services';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './style.css';
import {
  parseTaskWorkflowColumns,
  parseTaskWorkflowFields,
  serializeTaskWorkflowFields,
} from './task-workflow-utils';

const DraftRowInput = ({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(
    (next: string) => {
      onCommit(next);
    },
    [onCommit]
  );

  return (
    <RowInput
      value={draft}
      placeholder={placeholder}
      onChange={setDraft}
      onBlur={event => commit(event.currentTarget.value)}
      onEnter={commit}
    />
  );
};

const highlightAfterDueDateMenuContentOptions: MenuProps['contentOptions'] = {
  align: 'end',
  sideOffset: 16,
  style: { width: 250 },
};

const highlightAfterDueDateItems: {
  value: 'highlight' | 'hide' | 'off';
  label: string;
}[] = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'hide', label: 'Hide' },
  { value: 'off', label: 'Off' },
];

export const TaskWorkflow = () => {
  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(editorSetting.settings$);
  const defaults = settings.taskWorkflowDefaults;

  const fieldText = useMemo(
    () => serializeTaskWorkflowFields(defaults.list.fieldDefs),
    [defaults.list.fieldDefs]
  );
  const kanbanColumnsText = useMemo(
    () => defaults.database.kanbanColumns.join(', '),
    [defaults.database.kanbanColumns]
  );

  const setDefaults = useCallback(
    (next: TaskWorkflowDefaults) => {
      editorSetting.provider.set('taskWorkflowDefaults', JSON.stringify(next));
    },
    [editorSetting.provider]
  );

  return (
    <SettingWrapper title="List, Database, and Kanban">
      <SettingRow
        name="Optional list fields"
        desc="Default TODO fields. Format: key:type:label. Keys cannot contain spaces; use label for display names. Types: text, number, date, select, multi_select, progress."
      >
        <DraftRowInput
          value={fieldText}
          placeholder="estimate:number:Estimate, due:date:Due, owner:select:Owner"
          onCommit={value => {
            setDefaults({
              ...defaults,
              list: {
                ...defaults.list,
                fieldDefs: parseTaskWorkflowFields(value),
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Optional list field layout"
        desc="Default placement for optional TODO fields. Aligned is the default."
      >
        <select
          value={defaults.list.fieldLayout}
          onChange={event => {
            setDefaults({
              ...defaults,
              list: {
                ...defaults.list,
                fieldLayout: event.currentTarget.value as
                  | 'inline'
                  | 'aligned'
                  | 'right',
              },
            });
          }}
        >
          <option value="aligned">Aligned</option>
          <option value="inline">Inline</option>
          <option value="right">Right</option>
        </select>
      </SettingRow>
      <SettingRow
        name="Database status column"
        desc="Default status column name for promoted TODO databases."
      >
        <DraftRowInput
          value={defaults.list.statusMapping.statusColumnName}
          placeholder="Status"
          onCommit={value => {
            setDefaults({
              ...defaults,
              list: {
                ...defaults.list,
                statusMapping: {
                  ...defaults.list.statusMapping,
                  statusColumnName: value,
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Done tag"
        desc="Default database status label for checked TODOs."
      >
        <DraftRowInput
          value={defaults.list.statusMapping.doneTagLabel}
          placeholder="Done"
          onCommit={value => {
            setDefaults({
              ...defaults,
              list: {
                ...defaults.list,
                statusMapping: {
                  ...defaults.list.statusMapping,
                  doneTagLabel: value,
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Not-done tag"
        desc="Optional status label for unchecked TODOs. Empty leaves them unmapped."
      >
        <DraftRowInput
          value={defaults.list.statusMapping.notDoneTagLabel ?? ''}
          placeholder=""
          onCommit={value => {
            setDefaults({
              ...defaults,
              list: {
                ...defaults.list,
                statusMapping: {
                  ...defaults.list.statusMapping,
                  notDoneTagLabel: value,
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Parent done roll-up"
        desc="Set parent Done when all children are Done."
      >
        <Switch
          checked={
            defaults.database.taskStatusInheritance.done ===
            'require-all-subtasks-complete'
          }
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                taskStatusInheritance: {
                  ...defaults.database.taskStatusInheritance,
                  done: checked ? 'require-all-subtasks-complete' : 'disabled',
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Parent progress roll-up"
        desc="Set parent In Progress when any child starts."
      >
        <Switch
          checked={
            defaults.database.taskStatusInheritance.inProgress ===
            'start-when-any-subtask-starts'
          }
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                taskStatusInheritance: {
                  ...defaults.database.taskStatusInheritance,
                  inProgress: checked
                    ? 'start-when-any-subtask-starts'
                    : 'disabled',
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Auto-demote auto-derived Done"
        desc="Manually set Done stays locked; auto-derived Done can follow child changes."
      >
        <Switch
          checked={defaults.database.taskStatusInheritance.autoDemoteAutoDone}
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                taskStatusInheritance: {
                  ...defaults.database.taskStatusInheritance,
                  autoDemoteAutoDone: checked,
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Manual Done cascades"
        desc="When a parent is manually set to Done, set descendants to Done too."
      >
        <Switch
          checked={
            defaults.database.taskStatusInheritance
              .cascadeManualDoneToDescendants
          }
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                taskStatusInheritance: {
                  ...defaults.database.taskStatusInheritance,
                  cascadeManualDoneToDescendants: checked,
                },
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Kanban columns"
        desc="Comma-separated Label:semantic pairs. Semantics: none, todo, in_progress, done."
      >
        <DraftRowInput
          value={kanbanColumnsText}
          placeholder="Todo:todo, In Progress:in_progress, Review:in_progress, Done:done"
          onCommit={value => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                kanbanColumns: parseTaskWorkflowColumns(value),
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name="Highlight after due date"
        desc="Default treatment for a row that's overdue and not yet done. Individual tables can override this."
      >
        <Menu
          contentOptions={highlightAfterDueDateMenuContentOptions}
          items={highlightAfterDueDateItems.map(item => (
            <MenuItem
              key={item.value}
              selected={item.value === defaults.database.highlightAfterDueDate}
              onSelect={() => {
                setDefaults({
                  ...defaults,
                  database: {
                    ...defaults.database,
                    highlightAfterDueDate: item.value,
                  },
                });
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        >
          <MenuTrigger className={styles.menuTrigger}>
            {
              highlightAfterDueDateItems.find(
                item => item.value === defaults.database.highlightAfterDueDate
              )?.label
            }
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name="Hide from calendar when done"
        desc="Once a row is marked Done, remove its entry from any calendar view. Global setting only."
      >
        <Switch
          checked={defaults.database.hideFromCalendarWhenDone}
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                hideFromCalendarWhenDone: checked,
              },
            });
          }}
        />
      </SettingRow>
      <SettingRow
        name='Show "Due date" in Journal todo'
        desc="Whether a newly-created Due date column starts visible in table view. Individual tables can always be toggled via the properties menu regardless of this default."
      >
        <Switch
          checked={defaults.database.showDueDateColumn}
          onChange={checked => {
            setDefaults({
              ...defaults,
              database: {
                ...defaults.database,
                showDueDateColumn: checked,
              },
            });
          }}
        />
      </SettingRow>
    </SettingWrapper>
  );
};
