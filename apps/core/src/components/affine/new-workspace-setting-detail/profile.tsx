import { FlexWrapper, Input, Wrapper } from '@affine/component';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CameraIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import clsx from 'clsx';
import { useSetAtom } from 'jotai';
import {
  type KeyboardEvent,
  startTransition,
  useCallback,
  useRef,
  useState,
} from 'react';

import { Upload } from '../../pure/file-upload';
import { type WorkspaceSettingDetailProps } from './index';
import * as style from './style.css';

export interface ProfilePanelProps extends WorkspaceSettingDetailProps {
  workspace: AffineOfficialWorkspace;
}

export const ProfilePanel = ({ workspace, isOwner }: ProfilePanelProps) => {
  const t = useAFFiNEI18N();
  const ref = useRef(null);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const [, update] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );

  const [name, setName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );

  const [input, setInput] = useState<string>(name);

  const handleUpdateWorkspaceName = useCallback(
    (name: string) => {
      setName(name);
      pushNotification({
        title: t['Update workspace name success'](),
        type: 'success',
      });
    },
    [pushNotification, setName, t]
  );

  const handleSetInput = useCallback((value: string) => {
    startTransition(() => {
      setInput(value);
    });
  }, []);

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.code === 'Enter' && name !== input) {
        handleUpdateWorkspaceName(input);
      }
    },
    [handleUpdateWorkspaceName, input, name]
  );

  const handleClick = useCallback(() => {
    handleUpdateWorkspaceName(input);
  }, [handleUpdateWorkspaceName, input]);

  return (
    <div className={style.profileWrapper}>
      <Tooltip
        content={t['Click to replace photo']()}
        portalOptions={{
          container: ref.current,
        }}
      >
        <div
          className={clsx(style.avatarWrapper, { disable: !isOwner })}
          ref={ref}
        >
          <Upload
            accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
            fileChange={update}
            data-testid="upload-avatar"
          >
            <>
              <div className="camera-icon-wrapper">
                <CameraIcon />
              </div>
              <WorkspaceAvatar
                size={56}
                workspace={workspace.blockSuiteWorkspace}
              />
            </>
          </Upload>
        </div>
      </Tooltip>

      <Wrapper marginLeft={20}>
        <div className={style.label}>{t['Workspace Name']()}</div>
        <FlexWrapper alignItems="center" flexGrow="1">
          <Input
            disabled={!isOwner}
            width={280}
            height={32}
            defaultValue={input}
            data-testid="workspace-name-input"
            placeholder={t['Workspace Name']()}
            maxLength={64}
            minLength={0}
            onChange={handleSetInput}
            onKeyUp={handleKeyUp}
          />
          {input === workspace.blockSuiteWorkspace.meta.name ? null : (
            <Button
              data-testid="save-workspace-name"
              onClick={handleClick}
              style={{
                marginLeft: '12px',
              }}
            >
              {t['com.affine.editCollection.save']()}
            </Button>
          )}
        </FlexWrapper>
      </Wrapper>
    </div>
  );
};
