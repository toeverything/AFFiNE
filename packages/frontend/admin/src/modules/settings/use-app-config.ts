import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import { notify } from '@affine/component';
import { UserFriendlyError } from '@affine/error';
import {
  appConfigQuery,
  type UpdateAppConfigInput,
  updateAppConfigMutation,
} from '@affine/graphql';
import { cloneDeep, get, set, unset } from 'lodash-es';
import { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from './config';
import { isEqual } from './utils';

export { type UpdateAppConfigInput };

export type AppConfigUpdates = Record<
  string,
  { from: any; to: any; clear?: boolean }
>;
const getUpdateInputs = (
  entries: Array<[string, { from: any; to: any; clear?: boolean }]>
): UpdateAppConfigInput[] => {
  return entries.map(([key, value]) => {
    const splitIndex = key.indexOf('.');
    const module = key.slice(0, splitIndex);
    const field = key.slice(splitIndex + 1);

    return value.clear
      ? { module, key: field, clear: true }
      : { module, key: field, value: value.to };
  });
};

export const useAppConfig = () => {
  const {
    data: { appConfig, appConfigMetadata },
    mutate,
  } = useQuery({
    query: appConfigQuery,
  });

  const { trigger: saveUpdates } = useMutation({
    mutation: updateAppConfigMutation,
  });

  const [updates, setUpdates] = useState<AppConfigUpdates>({});
  const [patchedAppConfig, setPatchedAppConfig] = useState<AppConfig>(() =>
    cloneDeep(appConfig)
  );
  const [savingModules, setSavingModules] = useState<Record<string, boolean>>(
    {}
  );
  const [groupVersions, setGroupVersions] = useState<Record<string, number>>(
    {}
  );

  useEffect(() => {
    if (Object.keys(updates).length === 0) {
      setPatchedAppConfig(cloneDeep(appConfig));
    }
  }, [appConfig, updates]);

  const getEntriesByModule = useCallback(
    (module: string, source: AppConfigUpdates = updates) => {
      return Object.entries(source).filter(([key]) =>
        key.startsWith(`${module}.`)
      );
    },
    [updates]
  );

  const clearModuleUpdates = useCallback(
    (module: string) => {
      setUpdates(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${module}.`)) {
            delete next[key];
          }
        });
        return next;
      });
    },
    [setUpdates]
  );

  const bumpGroupVersion = useCallback((module: string) => {
    setGroupVersions(prev => ({
      ...prev,
      [module]: (prev[module] ?? 0) + 1,
    }));
  }, []);

  const save = useCallback(async () => {
    const allEntries = Object.entries(updates);
    if (allEntries.length === 0) {
      return;
    }

    try {
      await saveUpdates({
        updates: getUpdateInputs(allEntries),
      });
      const refreshed = await mutate();

      setUpdates({});
      setPatchedAppConfig(cloneDeep(refreshed?.appConfig ?? appConfig));
      notify.success({
        title: 'Saved',
        message: 'Settings have been saved successfully.',
      });
    } catch (e) {
      const error = UserFriendlyError.fromAny(e);
      notify.error({
        title: 'Failed to save',
        message: error.message,
      });
      console.error(e);
    }
  }, [updates, mutate, saveUpdates, appConfig]);

  const saveGroup = useCallback(
    async (module: string) => {
      const moduleEntries = getEntriesByModule(module);
      if (moduleEntries.length === 0) {
        return;
      }

      setSavingModules(prev => ({
        ...prev,
        [module]: true,
      }));

      try {
        await saveUpdates({
          updates: getUpdateInputs(moduleEntries),
        });
        const refreshed = await mutate();

        clearModuleUpdates(module);
        setPatchedAppConfig(() => {
          const next = cloneDeep(refreshed?.appConfig ?? appConfig);
          for (const [key, value] of Object.entries(updates)) {
            if (!key.startsWith(`${module}.`) && !value.clear) {
              set(next, key, value.to);
            }
          }
          return next;
        });
        bumpGroupVersion(module);
        notify.success({
          title: 'Saved',
          message: 'Settings have been saved successfully.',
        });
      } catch (e) {
        const error = UserFriendlyError.fromAny(e);
        notify.error({
          title: 'Failed to save',
          message: error.message,
        });
        console.error(e);
      } finally {
        setSavingModules(prev => ({
          ...prev,
          [module]: false,
        }));
      }
    },
    [
      bumpGroupVersion,
      clearModuleUpdates,
      getEntriesByModule,
      mutate,
      saveUpdates,
      appConfig,
      updates,
    ]
  );

  const update = useCallback(
    (path: string, value: any) => {
      const [module, field, subField] = path.split('/');
      const key = `${module}.${field}`;
      const from = get(appConfig, key);
      setUpdates(prev => {
        const to = subField
          ? set(cloneDeep(prev[key]?.to ?? from ?? {}), subField, value)
          : value;

        if (isEqual(from, to)) {
          const next = { ...prev };
          delete next[key];
          return next;
        }

        return {
          ...prev,
          [key]: {
            from,
            to,
          },
        };
      });

      setPatchedAppConfig(prev => {
        const next = cloneDeep(prev);
        if (subField) {
          const nextValue = set(
            cloneDeep(get(next, `${module}.${field}`) ?? {}),
            subField,
            value
          );
          set(next, `${module}.${field}`, nextValue);
          return next;
        }
        set(next, `${module}.${field}`, value);
        return next;
      });
    },
    [appConfig]
  );

  const clear = useCallback(
    (path: string) => {
      const [module, field] = path.split('/');
      const key = `${module}.${field}`;
      setUpdates(prev => ({
        ...prev,
        [key]: { from: get(appConfig, key), to: undefined, clear: true },
      }));
      setPatchedAppConfig(prev => {
        const next = cloneDeep(prev);
        unset(next, key);
        return next;
      });
    },
    [appConfig]
  );

  const resetGroup = useCallback(
    (module: string) => {
      clearModuleUpdates(module);
      setPatchedAppConfig(prev => {
        return {
          ...prev,
          [module]: cloneDeep(appConfig[module]),
        };
      });
      bumpGroupVersion(module);
    },
    [appConfig, bumpGroupVersion, clearModuleUpdates]
  );

  const isGroupDirty = useCallback(
    (module: string) => getEntriesByModule(module).length > 0,
    [getEntriesByModule]
  );

  const isGroupSaving = useCallback(
    (module: string) => Boolean(savingModules[module]),
    [savingModules]
  );

  const getGroupVersion = useCallback(
    (module: string) => groupVersions[module] ?? 0,
    [groupVersions]
  );

  return {
    appConfig: appConfig as AppConfig,
    appConfigMetadata: appConfigMetadata as Record<string, unknown>,
    patchedAppConfig,
    update,
    clear,
    save,
    saveGroup,
    resetGroup,
    isGroupDirty,
    isGroupSaving,
    getGroupVersion,
    updates,
  };
};
