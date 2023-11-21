import { serverConfigQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export const useServerFlavor = () => {
  const { data: config } = useQuery({
    query: serverConfigQuery,
  });

  return config.serverConfig.flavor;
};

export const useSelfHosted = () => {
  const serverFlavor = useServerFlavor();

  return serverFlavor === 'selfhosted';
};
