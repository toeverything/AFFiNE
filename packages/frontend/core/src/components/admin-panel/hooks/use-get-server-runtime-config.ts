import { useQuery } from '@affine/core/hooks/use-query';
import { getServerRuntimeConfigQuery } from '@affine/graphql';
import { useMemo } from 'react';

export const useGetServerRuntimeConfig = () => {
  const { data } = useQuery({
    query: getServerRuntimeConfigQuery,
  });

  const serverRuntimeConfig = useMemo(
    () =>
      data?.serverRuntimeConfig.sort((a, b) => a.id.localeCompare(b.id)) ?? [],
    [data]
  );

  // collect all the modules and config keys in each module
  const moduleList = useMemo(() => {
    const moduleMap: { [key: string]: string[] } = {};

    serverRuntimeConfig.forEach(config => {
      if (!moduleMap[config.module]) {
        moduleMap[config.module] = [];
      }
      moduleMap[config.module].push(config.key);
    });

    return Object.keys(moduleMap)
      .sort((a, b) => a.localeCompare(b))
      .map(moduleName => ({
        moduleName,
        keys: moduleMap[moduleName].sort((a, b) => a.localeCompare(b)),
      }));
  }, [serverRuntimeConfig]);

  // group config by module name
  const configGroup = useMemo(() => {
    const configMap = new Map<string, typeof serverRuntimeConfig>();

    serverRuntimeConfig.forEach(config => {
      if (!configMap.has(config.module)) {
        configMap.set(config.module, []);
      }
      configMap.get(config.module)?.push(config);
    });

    return Array.from(configMap.entries()).map(([moduleName, configs]) => ({
      moduleName,
      configs,
    }));
  }, [serverRuntimeConfig]);

  return {
    serverRuntimeConfig,
    moduleList,
    configGroup,
  };
};
