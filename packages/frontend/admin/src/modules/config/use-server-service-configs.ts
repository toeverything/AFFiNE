import { useQueryImmutable } from '@affine/core/components/hooks/use-query';
import { getServerServiceConfigsQuery } from '@affine/graphql';
import { useMemo } from 'react';

export type ServerConfig = {
  externalUrl: string;
  https: boolean;
  host: string;
  port: number;
  path: string;
};

export type MailerConfig = {
  host: string;
  port: number;
  sender: string;
};

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  database: string;
};

export type ServerServiceConfig = {
  name: string;
  config: ServerConfig | MailerConfig | DatabaseConfig;
};

export const useServerServiceConfigs = () => {
  const { data } = useQueryImmutable({
    query: getServerServiceConfigsQuery,
  });
  const server = useMemo(
    () =>
      data.serverServiceConfigs.find(
        (service: ServerServiceConfig) => service.name === 'server'
      ),
    [data.serverServiceConfigs]
  );
  const mailer = useMemo(
    () =>
      data.serverServiceConfigs.find(
        (service: ServerServiceConfig) => service.name === 'mailer'
      ),
    [data.serverServiceConfigs]
  );
  const database = useMemo(
    () =>
      data.serverServiceConfigs.find(
        (service: ServerServiceConfig) => service.name === 'database'
      ),
    [data.serverServiceConfigs]
  );

  const serverConfig = server?.config as ServerConfig | undefined;
  const mailerConfig = mailer?.config as MailerConfig | undefined;
  const databaseConfig = database?.config as DatabaseConfig | undefined;

  return { serverConfig, mailerConfig, databaseConfig };
};
