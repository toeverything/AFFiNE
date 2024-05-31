import { Scrollable } from '@affine/component';
import type { RuntimeConfigType } from '@affine/graphql';
import { FeatureType, getUserFeaturesQuery } from '@affine/graphql';
import { useCallback, useMemo, useState } from 'react';

import {
  AdminPanelHeader,
  CollapsibleItem,
  formatValue,
  formatValueForInput,
  isEqual,
  type ModifiedValues,
  renderInput,
  RuntimeSettingRow,
  useGetServerRuntimeConfig,
} from '../components/admin-panel';
import { useUpdateServerRuntimeConfigs } from '../components/admin-panel/use-update-server-runtime-config';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useQuery } from '../hooks/use-query';
import * as styles from './admin-panel.css';

export const AdminPanel = () => {
  const { serverRuntimeConfig, moduleList, configGroup } =
    useGetServerRuntimeConfig();

  const [currentModule, setCurrentModule] = useState<string>(
    moduleList[0].moduleName
  );

  const { trigger } = useUpdateServerRuntimeConfigs();

  const [configValues, setConfigValues] = useState(
    serverRuntimeConfig.reduce(
      (acc, config) => {
        acc[config.id] = config.value;
        return acc;
      },
      {} as Record<string, any>
    )
  );

  const handleInputChange = useCallback(
    (key: string, value: any, type: RuntimeConfigType) => {
      const newValue = formatValueForInput(value, type);
      setConfigValues(prevValues => ({
        ...prevValues,
        [key]: newValue,
      }));
    },
    []
  );

  const modifiedValues: ModifiedValues[] = useMemo(() => {
    return serverRuntimeConfig
      .filter(config => !isEqual(config.value, configValues[config.id]))
      .map(config => ({
        id: config.id,
        key: config.key,
        expiredValue: config.value,
        newValue: configValues[config.id],
      }));
  }, [configValues, serverRuntimeConfig]);

  const handleSave = useCallback(() => {
    // post value example: { "key1": "newValue1","key2": "newValue2"}
    const updates: Record<string, any> = {};

    modifiedValues.forEach(item => {
      if (item.id && item.newValue !== undefined) {
        updates[item.id] = item.newValue;
      }
    });
    trigger({ updates });
  }, [modifiedValues, trigger]);

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <div className={styles.sideBar}>
          {moduleList.map(module => (
            <CollapsibleItem
              key={module.moduleName}
              items={module.keys}
              title={module.moduleName}
              currentModule={currentModule}
              changeModule={setCurrentModule}
            />
          ))}
        </div>
        <div className={styles.main}>
          <AdminPanelHeader
            modifiedValues={modifiedValues}
            onConfirm={handleSave}
          />
          <Scrollable.Root>
            <Scrollable.Viewport>
              <div className={styles.scrollArea}>
                {configGroup
                  .filter(group => group.moduleName === currentModule)
                  .map(group => {
                    const { moduleName, configs } = group;
                    return (
                      <div
                        id={moduleName}
                        className={styles.moduleContainer}
                        key={moduleName}
                      >
                        <div className={styles.module}>{moduleName}</div>
                        {configs?.map(config => {
                          const { id, type, description, updatedAt } = config;
                          const isValueEqual = isEqual(
                            config.value,
                            configValues[id]
                          );
                          const formatServerValue = formatValue(config.value);
                          const formatCurrentValue = formatValue(
                            configValues[id]
                          );
                          return (
                            <RuntimeSettingRow
                              key={id}
                              id={id}
                              description={description}
                              lastUpdatedTime={updatedAt}
                              operation={renderInput(
                                type,
                                configValues[id],
                                value => handleInputChange(id, value, type)
                              )}
                            >
                              <div style={{ opacity: isValueEqual ? 0 : 1 }}>
                                {formatServerValue} =&gt; {formatCurrentValue}
                              </div>
                            </RuntimeSettingRow>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            </Scrollable.Viewport>
            <Scrollable.Scrollbar />
          </Scrollable.Root>
        </div>
      </div>
    </div>
  );
};

export const Component = () => {
  const { data } = useQuery({
    query: getUserFeaturesQuery,
  });
  const { jumpTo404 } = useNavigateHelper();
  const userFeatures = data?.currentUser?.features;
  if (!userFeatures || !userFeatures.includes(FeatureType.Admin)) {
    jumpTo404();
    return null;
  }

  return <AdminPanel />;
};
