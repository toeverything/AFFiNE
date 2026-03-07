import { useQuery } from '@affine/admin/use-query';
import { listCopilotAvailableModelsQuery } from '@affine/graphql';
import { useMemo } from 'react';

export type ModelGroup = {
  provider: string;
  profileId: string;
  models: string[];
};

export function useCopilotModels() {
  const { data, error, isValidating } = useQuery(
    { query: listCopilotAvailableModelsQuery },
    { suspense: false }
  );

  const groups: ModelGroup[] = useMemo(
    () => data?.listCopilotAvailableModels ?? [],
    [data]
  );

  const allModels = useMemo(() => {
    const set = new Set<string>();
    for (const group of groups) {
      for (const model of group.models) {
        set.add(model);
      }
    }
    return [...set].sort();
  }, [groups]);

  return { groups, allModels, loading: isValidating && !data, error };
}
