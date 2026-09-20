import {
  Button,
  DragHandle,
  IconButton,
  Menu,
  MenuItem,
  Switch,
} from '@affine/component';
import { useI18n } from '@affine/i18n';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useState } from 'react';

import * as styles from './index.css';
import { byokT } from './metadata';
import { ModelEditorModal } from './model-editor-modal';
import {
  type catalogModels,
  type ModelDeclaration,
  modelUseCases,
  useCases,
} from './model-utils';
import type { ByokKey } from './types';

export const ModelSelector = ({
  customEndpoint,
  catalog,
  models,
  validation,
  onChange,
}: {
  customEndpoint: boolean;
  catalog: ReturnType<typeof catalogModels>;
  models: ModelDeclaration[];
  validation?: ByokKey['validation'];
  onChange: (models: ModelDeclaration[]) => void;
}) => {
  const t = useI18n();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const update = (index: number, model: ModelDeclaration) => {
    onChange(models.map((current, i) => (i === index ? model : current)));
  };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const drop = (targetIndex: number) => {
    if (draggingIndex === null || draggingIndex === targetIndex) return;
    const next = [...models];
    const [dragged] = next.splice(draggingIndex, 1);
    next.splice(targetIndex, 0, dragged);
    onChange(next);
    setDraggingIndex(null);
  };
  const evidence = (modelId: string) => {
    const checks = validation?.models.find(
      model => model.modelId === modelId
    )?.checks;
    if (!checks?.length) return byokT(t, 'model.status.not-tested');
    const verified = checks.filter(
      check => check.status.kind === 'verified'
    ).length;
    if (verified === checks.length) return byokT(t, 'model.status.verified');
    if (verified === 0) return byokT(t, 'model.status.failed');
    return byokT(t, 'model.status.partially-verified', {
      verified,
      total: checks.length,
    });
  };

  return (
    <>
      <div className={styles.modelToolbar}>
        <span className={styles.description}>
          {byokT(t, 'models.description.order')}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setEditingIndex(null);
            setEditorOpen(true);
          }}
        >
          {byokT(t, 'action.add-model')}
        </Button>
      </div>
      {models.length ? (
        <ol className={styles.selectedModels}>
          {models.map((model, index) => {
            const catalogModel = catalog.find(
              item => item.modelId === model.modelId
            );
            const selected = modelUseCases(model);
            return (
              <li
                className={`${styles.selectedModel} ${
                  model.enabled ? '' : styles.selectedModelDisabled
                }`}
                key={model.modelId}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  drop(index);
                }}
              >
                <div
                  className={styles.modelDragHandle}
                  draggable
                  title={byokT(t, 'action.reorder')}
                  onDragStart={() => setDraggingIndex(index)}
                  onDragEnd={() => setDraggingIndex(null)}
                >
                  <DragHandle dragging={draggingIndex === index} />
                </div>
                <div className={styles.modelCopy}>
                  <strong>{catalogModel?.displayName ?? model.modelId}</strong>
                  {catalogModel?.displayName ? (
                    <small>{model.modelId}</small>
                  ) : null}
                  <span className={styles.tags}>
                    {selected.slice(0, 3).map(useCase => {
                      const item = useCases.find(item => item.id === useCase);
                      return item ? (
                        <span className={styles.tag} key={useCase}>
                          {byokT(t, item.labelKey)}
                        </span>
                      ) : null;
                    })}
                    {selected.length > 3 ? (
                      <span className={styles.tag}>+{selected.length - 3}</span>
                    ) : null}
                  </span>
                </div>
                <span className={styles.modelStatus}>
                  {model.enabled
                    ? evidence(model.modelId)
                    : byokT(t, 'model.status.disabled')}
                </span>
                <Switch
                  checked={model.enabled}
                  aria-label={byokT(
                    t,
                    model.enabled
                      ? 'action.disable-model'
                      : 'action.enable-model',
                    { model: catalogModel?.displayName ?? model.modelId }
                  )}
                  onChange={enabled => update(index, { ...model, enabled })}
                />
                <Menu
                  items={
                    <>
                      {customEndpoint ? (
                        <MenuItem
                          onSelect={() => {
                            setEditingIndex(index);
                            setEditorOpen(true);
                          }}
                        >
                          {byokT(t, 'action.edit')}
                        </MenuItem>
                      ) : null}
                      <MenuItem
                        disabled={index === 0}
                        onSelect={() => move(index, -1)}
                      >
                        {byokT(t, 'action.move-up')}
                      </MenuItem>
                      <MenuItem
                        disabled={index === models.length - 1}
                        onSelect={() => move(index, 1)}
                      >
                        {byokT(t, 'action.move-down')}
                      </MenuItem>
                      <MenuItem
                        type="danger"
                        onSelect={() =>
                          onChange(models.filter((_, i) => i !== index))
                        }
                      >
                        {byokT(t, 'action.remove')}
                      </MenuItem>
                    </>
                  }
                >
                  <IconButton
                    size="20"
                    title={byokT(t, 'action.model-options', {
                      model: catalogModel?.displayName ?? model.modelId,
                    })}
                    icon={<MoreHorizontalIcon />}
                  />
                </Menu>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.modelEmpty}>{byokT(t, 'models.empty')}</div>
      )}
      <ModelEditorModal
        open={editorOpen}
        customEndpoint={customEndpoint}
        catalog={catalog}
        models={models}
        editingModel={editingIndex === null ? null : models[editingIndex]}
        onOpenChange={open => {
          setEditorOpen(open);
          if (!open) setEditingIndex(null);
        }}
        onSubmit={next => {
          if (editingIndex === null) {
            onChange([...models, ...next]);
          } else if (next[0]) {
            update(editingIndex, next[0]);
          }
          setEditingIndex(null);
        }}
      />
    </>
  );
};
