import { Button, Checkbox, Input, Modal } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useEffect, useMemo, useState } from 'react';

import * as styles from './index.css';
import { byokT } from './metadata';
import {
  capabilitiesForUseCases,
  type catalogModels,
  type ModelDeclaration,
  modelUseCases,
  type UseCase,
  useCases,
} from './model-utils';

export const ModelEditorModal = ({
  open,
  customEndpoint,
  catalog,
  models,
  editingModel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  customEndpoint: boolean;
  catalog: ReturnType<typeof catalogModels>;
  models: ModelDeclaration[];
  editingModel: ModelDeclaration | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (models: ModelDeclaration[]) => void;
}) => {
  const t = useI18n();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modelId, setModelId] = useState('');
  const [selectedUseCases, setSelectedUseCases] = useState<UseCase[]>(['chat']);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedIds([]);
    setModelId(editingModel?.modelId ?? '');
    setSelectedUseCases(editingModel ? modelUseCases(editingModel) : ['chat']);
  }, [editingModel, open]);

  const availableCatalog = useMemo(() => {
    return catalog
      .filter(item => !models.some(model => model.modelId === item.modelId))
      .sort(
        (left, right) => Number(right.recommended) - Number(left.recommended)
      );
  }, [catalog, models]);
  const available = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return availableCatalog.filter(
      item =>
        !query ||
        item.displayName.toLocaleLowerCase().includes(query) ||
        item.modelId.toLocaleLowerCase().includes(query)
    );
  }, [availableCatalog, search]);

  const submit = () => {
    if (customEndpoint) {
      onSubmit([
        {
          modelId: modelId.trim(),
          enabled: editingModel?.enabled ?? true,
          capabilities: capabilitiesForUseCases(editingModel, selectedUseCases),
        },
      ]);
    } else {
      onSubmit(
        selectedIds.flatMap(id => {
          const model = catalog.find(item => item.modelId === id);
          return model
            ? [
                {
                  modelId: model.modelId,
                  enabled: true,
                  capabilities: model.capabilities,
                },
              ]
            : [];
        })
      );
    }
    onOpenChange(false);
  };

  const normalizedModelId = modelId.trim();
  const duplicateModelId = models.some(
    model => model !== editingModel && model.modelId === normalizedModelId
  );
  const valid = customEndpoint
    ? !!normalizedModelId && !duplicateModelId && selectedUseCases.length > 0
    : selectedIds.length > 0;

  return (
    <Modal
      width={customEndpoint ? 520 : 560}
      open={open}
      onOpenChange={onOpenChange}
      descriptionClassName={styles.modelModalDescription}
      title={byokT(
        t,
        editingModel
          ? 'modal.edit-model-title'
          : customEndpoint
            ? 'modal.add-custom-model-title'
            : 'modal.add-model-title'
      )}
      description={byokT(
        t,
        customEndpoint
          ? 'modal.custom-model-description'
          : 'modal.catalog-model-description'
      )}
    >
      {customEndpoint ? (
        <div className={styles.modelModalBody}>
          <label className={styles.field}>
            <span className={styles.modelFieldLabel}>
              {byokT(t, 'field.model-id')}
            </span>
            <Input
              size="large"
              value={modelId}
              onChange={setModelId}
              placeholder={byokT(t, 'placeholder.model-id')}
            />
            {duplicateModelId ? (
              <span className={styles.error}>
                {byokT(t, 'model.duplicate-id')}
              </span>
            ) : null}
          </label>
          <fieldset className={styles.modelCapabilities}>
            <legend className={styles.modelFieldLabel}>
              {byokT(t, 'model.use-this-for')}
            </legend>
            <div className={styles.useCaseGrid}>
              {useCases.map(useCase => (
                <Checkbox
                  className={styles.modelUseCase}
                  labelClassName={styles.modelUseCaseLabel}
                  key={useCase.id}
                  name={`byok-model-use-${useCase.id}`}
                  label={byokT(t, useCase.labelKey)}
                  checked={selectedUseCases.includes(useCase.id)}
                  onChange={(_, checked) =>
                    setSelectedUseCases(
                      checked
                        ? [...selectedUseCases, useCase.id]
                        : selectedUseCases.filter(item => item !== useCase.id)
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
        </div>
      ) : (
        <div className={styles.modelModalBody}>
          {availableCatalog.length > 6 ? (
            <Input
              className={styles.modelSearch}
              size="large"
              value={search}
              onChange={setSearch}
              placeholder={byokT(t, 'placeholder.search-models')}
            />
          ) : null}
          <div className={styles.catalogChoices}>
            {available.length ? (
              available.map(model => {
                const modelUses = modelUseCases({
                  modelId: model.modelId,
                  enabled: true,
                  capabilities: model.capabilities,
                });
                const visibleUses = modelUses.slice(0, 3).flatMap(useCase => {
                  const item = useCases.find(item => item.id === useCase);
                  return item ? [byokT(t, item.labelKey)] : [];
                });
                if (modelUses.length > 3) {
                  visibleUses.push(`+${modelUses.length - 3}`);
                }
                return (
                  <label
                    className={styles.catalogChoice}
                    data-selected={selectedIds.includes(model.modelId)}
                    key={model.modelId}
                  >
                    <Checkbox
                      className={styles.modelCheckbox}
                      aria-label={model.displayName}
                      checked={selectedIds.includes(model.modelId)}
                      onChange={(_, checked) =>
                        setSelectedIds(
                          checked
                            ? [...selectedIds, model.modelId]
                            : selectedIds.filter(id => id !== model.modelId)
                        )
                      }
                    />
                    <span className={styles.catalogModelCopy}>
                      <span className={styles.catalogModelTitle}>
                        <strong>{model.displayName}</strong>
                        {model.recommended ? (
                          <span className={styles.recommended}>
                            {byokT(t, 'model.recommended')}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={styles.catalogModelMeta}
                        title={[model.modelId, ...visibleUses].join(' · ')}
                      >
                        {[model.modelId, ...visibleUses].join(' · ')}
                      </span>
                    </span>
                  </label>
                );
              })
            ) : (
              <div className={styles.modelEmpty}>
                {byokT(
                  t,
                  search ? 'models.no-search-results' : 'models.all-added'
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className={styles.modelModalActions}>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {byokT(t, 'action.cancel')}
        </Button>
        <Button variant="primary" disabled={!valid} onClick={submit}>
          {byokT(
            t,
            editingModel
              ? 'action.save-model'
              : customEndpoint
                ? 'action.add-model'
                : 'action.add-selected-models',
            { count: selectedIds.length }
          )}
        </Button>
      </div>
    </Modal>
  );
};
