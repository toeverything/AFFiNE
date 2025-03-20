import { SettingHeader } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

import { list } from './index.css';
import { ReadwiseIntegration } from './readwise';

export const IntegrationSetting = () => {
  const t = useI18n();
  return (
    <>
      <SettingHeader
        title={t['com.affine.integration.integrations']()}
        subtitle={
          <>
            {t['com.affine.integration.setting.description']()}
            {/* <br /> */}
            {/* <a>{t['Learn how to develop a integration for AFFiNE']()}</a> */}
          </>
        }
      />
      <ul className={list}>
        <ReadwiseIntegration />
      </ul>
    </>
  );
};
