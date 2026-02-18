import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import { notify } from '@affine/component';
import { UserFriendlyError } from '@affine/error';
import {
  appConfigQuery,
  type UpdateAppConfigInput,
  updateAppConfigMutation,
} from '@affine/graphql';
import { cloneDeep, get, merge, set } from 'lodash-es';
import { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from './config';
import { isEqual } from './utils';

export { type UpdateAppConfigInput };

export type AppConfigUpdates = Record<string, { from: any; to: any }>;
type SaveResponse =
  | { updateAppConfig?: Partial<AppConfig> }
  | Partial<AppConfig>;

const getUpdateInputs = (
  entries: Array<[string, { from: any; to: any }]>
): UpdateAppConfigInput[] => {
  return entries.map(([key, value]) => {
    const splitIndex = key.indexOf('.');
    const module = key.slice(0, splitIndex);
    const field = key.slice(splitIndex + 1);

    return {
      module,
      key: field,
      value: value.to,
    };
  });
};

const getSavedAppConfig = (response: SaveResponse): Partial<AppConfig> => {
  if ('updateAppConfig' in response) {
    return (response.updateAppConfig as Partial<AppConfig>) ?? {};
  }
  return response;
};

export const useAppConfig = () => {
  const {
    data: { appConfig },
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
      const response = (await saveUpdates({
        updates: getUpdateInputs(allEntries),
      })) as SaveResponse;
      const savedAppConfig = getSavedAppConfig(response);

      await mutate(prev => {
        return {
          appConfig: merge({}, prev?.appConfig ?? {}, savedAppConfig),
        };
      });

      setUpdates({});
      setPatchedAppConfig(prev => merge({}, prev, savedAppConfig));
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
  }, [updates, mutate, saveUpdates]);

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
        const response = (await saveUpdates({
          updates: getUpdateInputs(moduleEntries),
        })) as SaveResponse;
        const savedAppConfig = getSavedAppConfig(response);

        await mutate(prev => {
          return {
            appConfig: merge({}, prev?.appConfig ?? {}, savedAppConfig),
          };
        });

        clearModuleUpdates(module);
        setPatchedAppConfig(prev => merge({}, prev, savedAppConfig));
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
    patchedAppConfig,
    update,
    save,
    saveGroup,
    resetGroup,
    isGroupDirty,
    isGroupSaving,
    getGroupVersion,
    updates,
  };
};
