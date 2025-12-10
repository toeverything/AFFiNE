import { Menu, MenuItem } from '@affine/component';
import { type Server, ServersService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  CloudWorkspaceIcon,
  DoneIcon,
  LocalWorkspaceIcon,
  SelfhostIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

import * as styles from './server-selector.css';

export interface ServerSelectorProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  selectedId: Server['id'];
  onChange: (id: Server['id']) => void;
  placeholder?: ReactNode;
}
export const ServerSelector = ({
  selectedId,
  onChange,
  placeholder,
  className,
  ...props
}: ServerSelectorProps) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  const serversService = useService(ServersService);
  const servers = useLiveData(serversService.servers$);

  const selectedServer = useMemo(() => {
    return servers.find(s => s.id === selectedId);
  }, [selectedId, servers]);

  const serverName = useLiveData(
    selectedServer?.config$.selector(c => c.serverName)
  );
  const selectedServerName =
    selectedId === 'local'
      ? t['com.affine.workspaceList.workspaceListType.local']()
      : serverName;

  return (
    <Menu
      rootOptions={{
        open,
        onOpenChange: setOpen,
      }}
      contentOptions={{
        style: {
          maxWidth: 432,
          width: 'calc(100dvw - 68px)',
        },
      }}
      items={
        <ul className={styles.list} data-testid="server-selector-list">
          <LocalSelectorItem
            onSelect={onChange}
            active={selectedId === 'local'}
          />
          {servers.map(server => (
            <ServerSelectorItem
              key={server.id}
              server={server}
              onSelect={onChange}
              active={selectedId === server.id}
            />
          ))}
        </ul>
      }
    >
      <div
        data-testid="server-selector-trigger"
        className={clsx(styles.trigger, className)}
        {...props}
      >
        {selectedServerName ?? placeholder}
        <ArrowDownSmallIcon className={clsx(styles.arrow, { open })} />
      </div>
    </Menu>
  );
};

const LocalSelectorItem = ({
  onSelect,
  active,
}: {
  onSelect?: (id: string) => void;
  active?: boolean;
}) => {
  const t = useI18n();
  const handleSelect = useCallback(() => {
    onSelect?.('local');
  }, [onSelect]);
  return (
    <MenuItem
      data-testid="local"
      className={styles.item}
      prefixIcon={<LocalWorkspaceIcon />}
      onClick={handleSelect}
      suffixIcon={active ? <DoneIcon className={styles.done} /> : null}
    >
      {t['com.affine.workspaceList.workspaceListType.local']()}
    </MenuItem>
  );
};

const ServerSelectorItem = ({
  server,
  onSelect,
  active,
}: {
  server: Server;
  onSelect?: (id: string) => void;
  active?: boolean;
}) => {
  const name = useLiveData(server.config$.selector(c => c.serverName));

  const Icon = server.id === 'affine-cloud' ? CloudWorkspaceIcon : SelfhostIcon;

  const handleSelect = useCallback(() => {
    onSelect?.(server.id);
  }, [onSelect, server.id]);

  return (
    <MenuItem
      data-testid={server.id}
      className={styles.item}
      prefixIcon={<Icon />}
      onClick={handleSelect}
      suffixIcon={active ? <DoneIcon className={styles.done} /> : null}
    >
      {name}
    </MenuItem>
  );
};
