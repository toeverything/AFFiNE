import { Button } from '@affine/component';
import { WorkspaceTagsInlineEditor } from '@affine/core/components/tags';
import {
  IntegrationService,
  IntegrationTypeIcon,
} from '@affine/core/modules/integration';
import type { ReadwiseConfig } from '@affine/core/modules/integration/type';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import {
  IntegrationSettingHeader,
  IntegrationSettingItem,
  IntegrationSettingTextRadioGroup,
  type IntegrationSettingTextRadioGroupItem,
  IntegrationSettingToggle,
} from '../setting';
import { ReadwiseConnectButton } from './connect';
import { ReadwiseDisconnectButton } from './connected';
import { ImportDialog } from './import-dialog';
import * as styles from './setting-panel.css';
import { readwiseTrack } from './track';

export const ReadwiseSettingPanel = () => {
  const readwise = useService(IntegrationService).readwise;
  const settings = useLiveData(readwise.settings$);
  const token = settings?.token;

  return token ? <ReadwiseConnectedSetting /> : <ReadwiseNotConnectedSetting />;
};

const ReadwiseSettingHeader = ({ action }: { action?: ReactNode }) => {
  const t = useI18n();

  return (
    <IntegrationSettingHeader
      icon={<IntegrationTypeIcon type="readwise" />}
      name={t['com.affine.integration.readwise.name']()}
      desc={t['com.affine.integration.readwise.desc']()}
      action={action}
    />
  );
};

const ReadwiseNotConnectedSetting = () => {
  const readwise = useService(IntegrationService).readwise;

  const handleConnectSuccess = useCallback(
    (token: string) => {
      readwise.connect(token);
    },
    [readwise]
  );

  return (
    <div>
      <ReadwiseSettingHeader />
      <ReadwiseConnectButton
        onSuccess={handleConnectSuccess}
        className={styles.connectButton}
        prefix={<PlusIcon />}
        size="large"
      />
    </div>
  );
};
const ReadwiseConnectedSetting = () => {
  const [openImportDialog, setOpenImportDialog] = useState(false);

  const onImport = useCallback(() => {
    setOpenImportDialog(true);
  }, []);

  const closeImportDialog = useCallback(() => {
    setOpenImportDialog(false);
  }, []);

  return (
    <div>
      <ReadwiseSettingHeader action={<ReadwiseDisconnectButton />} />
      <ul className={styles.settings}>
        <TagsSetting />
        <Divider />
        <NewHighlightSetting />
        <Divider />
        <UpdateStrategySetting />
        <Divider />
        <StartImport onImport={onImport} />
      </ul>
      {openImportDialog && <ImportDialog onClose={closeImportDialog} />}
    </div>
  );
};

const trackModifySetting = (
  item: 'New' | 'Update' | 'Tag',
  option: 'on' | 'off',
  method?: 'append' | 'override'
) => {
  readwiseTrack.modifyIntegrationSettings({
    item,
    option,
    method,
  });
};

const Divider = () => {
  return <li className={styles.divider} />;
};

const NewHighlightSetting = () => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;
  const syncNewHighlights = useLiveData(
    useMemo(() => readwise.setting$('syncNewHighlights'), [readwise])
  );

  const toggle = useCallback(
    (value: boolean) => {
      trackModifySetting('New', value ? 'on' : 'off');
      readwise.updateSetting('syncNewHighlights', value);
    },
    [readwise]
  );

  return (
    <li>
      <IntegrationSettingToggle
        checked={!!syncNewHighlights}
        name={t['com.affine.integration.readwise.setting.sync-new-name']()}
        desc={t['com.affine.integration.readwise.setting.sync-new-desc']()}
        onChange={toggle}
      />
    </li>
  );
};

const UpdateStrategySetting = () => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;
  const updateStrategy = useLiveData(
    useMemo(() => readwise.setting$('updateStrategy'), [readwise])
  );

  const toggle = useCallback(
    (value: boolean) => {
      trackModifySetting('Update', value ? 'on' : 'off', 'append');
      if (!value) readwise.updateSetting('updateStrategy', undefined);
      else readwise.updateSetting('updateStrategy', 'append');
    },
    [readwise]
  );

  const handleUpdate = useCallback(
    (value: ReadwiseConfig['updateStrategy']) => {
      trackModifySetting('Update', 'on', value);
      readwise.updateSetting('updateStrategy', value);
    },
    [readwise]
  );

  const strategies = useMemo(
    () =>
      [
        {
          name: t[
            'com.affine.integration.readwise.setting.update-append-name'
          ](),
          desc: t[
            'com.affine.integration.readwise.setting.update-append-desc'
          ](),
          value: 'append',
        },
        {
          name: t[
            'com.affine.integration.readwise.setting.update-override-name'
          ](),
          desc: t[
            'com.affine.integration.readwise.setting.update-override-desc'
          ](),
          value: 'override',
        },
      ] satisfies IntegrationSettingTextRadioGroupItem[],
    [t]
  );

  return (
    <>
      <li>
        <IntegrationSettingToggle
          checked={!!updateStrategy}
          name={t['com.affine.integration.readwise.setting.update-name']()}
          desc={t['com.affine.integration.readwise.setting.update-desc']()}
          onChange={toggle}
        />
      </li>
      <li
        className={styles.updateStrategyGroup}
        data-collapsed={!updateStrategy}
      >
        <div className={styles.updateStrategyGroupContent}>
          <h6 className={styles.updateStrategyLabel}>
            {t['com.affine.integration.readwise.setting.update-strategy']()}
          </h6>
          <IntegrationSettingTextRadioGroup
            items={strategies}
            checked={updateStrategy}
            onChange={handleUpdate}
          />
        </div>
      </li>
    </>
  );
};

const StartImport = ({ onImport }: { onImport: () => void }) => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;

  const handleImport = useCallback(() => {
    const lastImportedAt = readwise.setting$('lastImportedAt').value;
    readwiseTrack.startIntegrationImport({
      method: lastImportedAt ? 'withtimestamp' : 'new',
      control: 'Readwise settings',
    });
    onImport();
  }, [onImport, readwise]);

  return (
    <IntegrationSettingItem
      name={t['com.affine.integration.readwise.setting.start-import-name']()}
      desc={t['com.affine.integration.readwise.setting.start-import-desc']()}
    >
      <Button onClick={handleImport}>
        {t['com.affine.integration.readwise.setting.start-import-button']()}
      </Button>
    </IntegrationSettingItem>
  );
};

const TagsSetting = () => {
  const t = useI18n();
  const tagService = useService(TagService);
  const readwise = useService(IntegrationService).readwise;
  const tagMetas = useLiveData(tagService.tagList.tagMetas$);
  const tagIds = useLiveData(
    useMemo(() => readwise.setting$('tags'), [readwise])
  );

  const updateReadwiseTags = useCallback(
    (tagIds: string[]) => {
      readwise.updateSetting(
        'tags',
        tagIds.filter(id => !!tagMetas.some(tag => tag.id === id))
      );
    },
    [tagMetas, readwise]
  );

  const onSelectTag = useCallback(
    (tagId: string) => {
      trackModifySetting('Tag', 'on');
      updateReadwiseTags([...(tagIds ?? []), tagId]);
    },
    [tagIds, updateReadwiseTags]
  );
  const onDeselectTag = useCallback(
    (tagId: string) => {
      trackModifySetting('Tag', 'off');
      updateReadwiseTags(tagIds?.filter(id => id !== tagId) ?? []);
    },
    [tagIds, updateReadwiseTags]
  );
  return (
    <li>
      <h6 className={styles.tagsLabel}>
        {t['com.affine.integration.readwise.setting.tags-label']()}
      </h6>
      <WorkspaceTagsInlineEditor
        placeholder={
          <span className={styles.tagsPlaceholder}>
            {t['com.affine.integration.readwise.setting.tags-placeholder']()}
          </span>
        }
        className={styles.tagsEditor}
        tagMode="inline-tag"
        selectedTags={tagIds ?? []}
        onSelectTag={onSelectTag}
        onDeselectTag={onDeselectTag}
        modalMenu={true}
        menuClassName={styles.tagsMenu}
      />
    </li>
  );
};
