import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@affine/admin/components/ui/card';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import { Separator } from '@affine/admin/components/ui/separator';

import { AboutAFFiNE } from './about';
import type {
  DatabaseConfig,
  MailerConfig,
  ServerConfig,
} from './use-server-service-configs';
import { useServerServiceConfigs } from './use-server-service-configs';

export function ConfigPage() {
  return (
    <div className=" h-screen flex-1 space-y-1 flex-col flex">
      <div className="flex items-center justify-between px-6 py-3 max-md:ml-9">
        <div className="text-base font-medium">Config</div>
      </div>
      <Separator />
      <ScrollArea>
        <ServerServiceConfig />
        <AboutAFFiNE />
      </ScrollArea>
    </div>
  );
}

const ServerCard = ({ serverConfig }: { serverConfig?: ServerConfig }) => {
  if (!serverConfig) return null;
  return (
    <Card className="px-5 py-4">
      <CardHeader className="p-0">
        <CardTitle className="text-base font-semibold mb-3">Server</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="space-y-5">
          <div className="flex flex-col">
            <div className="text-sm font-medium">Domain</div>
            <div className="text-sm text-zinc-500 font-normal">
              {serverConfig.host}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Port</div>
            <div className="text-sm text-zinc-500 font-normal">
              {serverConfig.port}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">HTTPS Prefix</div>
            <div className="text-sm text-zinc-500 font-normal">
              {serverConfig.https.toString()}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">External Url</div>
            <div className="text-sm text-zinc-500 font-normal">
              {serverConfig.externalUrl}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
const DatabaseCard = ({
  databaseConfig,
}: {
  databaseConfig?: DatabaseConfig;
}) => {
  if (!databaseConfig) return null;
  return (
    <Card className="px-5 py-4">
      <CardHeader className="p-0">
        <CardTitle className="text-base font-semibold mb-3">Database</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="space-y-5">
          <div className="flex flex-col">
            <div className="text-sm font-medium">Domain</div>
            <div className="text-sm text-zinc-500 font-normal">
              {databaseConfig.host}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Port</div>
            <div className="text-sm text-zinc-500 font-normal">
              {databaseConfig.port}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">User</div>
            <div className="text-sm text-zinc-500 font-normal">
              {databaseConfig.user}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Database</div>
            <div className="text-sm text-zinc-500 font-normal">
              {databaseConfig.database}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
const MailerCard = ({ mailerConfig }: { mailerConfig?: MailerConfig }) => {
  if (!mailerConfig) return null;
  return (
    <Card className="px-5 py-4">
      <CardHeader className="p-0">
        <CardTitle className="text-base font-semibold mb-3">Email</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="space-y-5">
          <div className="flex flex-col">
            <div className="text-sm font-medium">Provider Domain</div>
            <div className="text-sm text-zinc-500 font-normal">
              {mailerConfig.host}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Port</div>
            <div className="text-sm text-zinc-500 font-normal">
              {mailerConfig.port}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Sender</div>
            <div className="text-sm text-zinc-500 font-normal">
              {mailerConfig.sender}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export function ServerServiceConfig() {
  const { serverConfig, mailerConfig, databaseConfig } =
    useServerServiceConfigs();

  return (
    <div className="flex flex-col py-5 px-6">
      <div className="flex items-center mb-5">
        <span className="text-2xl font-semibold">Server Config</span>
      </div>
      <div className=" items-start justify-center gap-6 rounded-lg grid grid-cols-2">
        <div className="col-span-2 grid items-start gap-6 lg:col-span-1">
          <ServerCard serverConfig={serverConfig} />
          <MailerCard mailerConfig={mailerConfig} />
        </div>
        <div className="col-span-2 grid items-start gap-6 lg:col-span-1">
          <DatabaseCard databaseConfig={databaseConfig} />
          <div className="px-5 py-4 border rounded text-sm text-zinc-500 font-normal">
            <span className="mr-1">
              These settings are controlled by Docker environment variables.
              Refer to the
            </span>
            <a
              href="https://docs.affine.pro/docs/self-host-affine"
              className="text-black underline"
            >
              Selfhost documentation.
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ConfigPage as Component };
