import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import { notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { UserFriendlyError } from '@affine/error';
import {
  appConfigQuery,
  type UpdateAppConfigInput,
  updateAppConfigMutation,
} from '@affine/graphql';
import { cloneDeep, get, merge, set } from 'lodash-es';
import { useCallback, useState } from 'react';

import type { AppConfig } from './config';

export { type UpdateAppConfigInput };

export type AppConfigUpdates = Record<string, { from: any; to: any }>;

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

  const save = useAsyncCallback(async () => {
    const updateInputs: UpdateAppConfigInput[] = Object.entries(updates).map(
      ([key, value]) => {
        const splitIndex = key.indexOf('.');
        const module = key.slice(0, splitIndex);
        const field = key.slice(splitIndex + 1);

        return {
          module,
          key: field,
          value: value.to,
        };
      }
    );

    try {
      const savedUpdates = await saveUpdates({
        updates: updateInputs,
      });
      await mutate(prev => {
        return { appConfig: merge({}, prev, savedUpdates) };
      });
      setUpdates({});
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

  const update = useCallback(
    (path: string, value: any) => {
      const [module, field, subField] = path.split('/');
      const key = `${module}.${field}`;
      const from = get(appConfig, key);
      setUpdates(prev => {
        const to = subField
          ? set(prev[key]?.to ?? { ...from }, subField, value)
          : value;

        return {
          ...prev,
          [key]: {
            from,
            to,
          },
        };
      });

      setPatchedAppConfig(prev => {
        return set(
          prev,
          `${module}.${field}${subField ? `.${subField}` : ''}`,
          value
        );
      });
    },
    [appConfig]
  );

  return {
    appConfig: appConfig as AppConfig,
    patchedAppConfig,
    update,
    save,
    updates,
  };
};
