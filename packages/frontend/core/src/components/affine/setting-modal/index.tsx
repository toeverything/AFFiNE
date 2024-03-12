import { Loading } from '@affine/component';
import { WorkspaceDetailSkeleton } from '@affine/component/setting-components';
import { Modal, type ModalProps } from '@affine/component/ui/modal';
import {
  openIssueFeedbackModalAtom,
  openStarAFFiNEModalAtom,
} from '@affine/core/atoms';
import { Trans } from '@affine/i18n';
import { ContactWithUsIcon } from '@blocksuite/icons';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import { Suspense, useCallback, useLayoutEffect, useRef } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { AccountSetting } from './account-setting';
import { GeneralSetting } from './general-setting';
import { SettingSidebar } from './setting-sidebar';
import * as style from './style.css';
import {
  type ActiveTab,
  type GeneralSettingKey,
  GeneralSettingKeys,
  type WorkspaceSubTab,
} from './types';
import { WorkspaceSetting } from './workspace-setting';

export interface SettingProps extends ModalProps {
  activeTab: ActiveTab;
  workspaceMetadata?: WorkspaceMetadata | null;
  onSettingClick: (params: {
    activeTab: ActiveTab;
    workspaceMetadata: WorkspaceMetadata | null;
  }) => void;
}

const isGeneralSetting = (key: string): key is GeneralSettingKey =>
  GeneralSettingKeys.includes(key as GeneralSettingKey);

const CenteredLoading = () => {
  return (
    <div className={style.centeredLoading}>
      <Loading size={24} />
    </div>
  );
};

const SettingModalInner = ({
  activeTab = 'appearance',
  workspaceMetadata = null,
  onSettingClick,
  ...modalProps
}: SettingProps) => {
  const loginStatus = useCurrentLoginStatus();

  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalContentWrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!modalProps.open) return;
    let animationFrameId: number;
    const onResize = debounce(() => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!modalContentRef.current || !modalContentWrapperRef.current) return;

        const wrapperWidth = modalContentWrapperRef.current.offsetWidth;
        const contentWidth = modalContentRef.current.offsetWidth;

        modalContentRef.current?.style.setProperty(
          '--setting-modal-width',
          `${wrapperWidth}px`
        );
        modalContentRef.current?.style.setProperty(
          '--setting-modal-gap-x',
          `${(wrapperWidth - contentWidth) / 2}px`
        );
      });
    }, 200);
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
    };
  }, [modalProps.open]);

  const onTabChange = useCallback(
    (key: ActiveTab, meta: WorkspaceMetadata | null) => {
      onSettingClick({ activeTab: key, workspaceMetadata: meta });
    },
    [onSettingClick]
  );
  const setOpenIssueFeedbackModal = useSetAtom(openIssueFeedbackModalAtom);
  const setOpenStarAFFiNEModal = useSetAtom(openStarAFFiNEModalAtom);

  const handleOpenIssueFeedbackModal = useCallback(() => {
    setOpenIssueFeedbackModal(true);
  }, [setOpenIssueFeedbackModal]);

  const handleOpenStarAFFiNEModal = useCallback(() => {
    setOpenStarAFFiNEModal(true);
  }, [setOpenStarAFFiNEModal]);

  return (
    <>
      <SettingSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        selectedWorkspaceId={workspaceMetadata?.id ?? null}
      />
      <div
        data-testid="setting-modal-content"
        className={style.wrapper}
        ref={modalContentWrapperRef}
      >
        <div ref={modalContentRef} className={style.centerContainer}>
          <div className={style.content}>
            <Suspense fallback={<WorkspaceDetailSkeleton />}>
              {activeTab.startsWith('workspace:') && workspaceMetadata ? (
                <WorkspaceSetting
                  subTab={activeTab.split(':')[1] as WorkspaceSubTab}
                  key={workspaceMetadata.id}
                  workspaceMetadata={workspaceMetadata}
                />
              ) : null}
              {isGeneralSetting(activeTab) ? (
                <GeneralSetting generalKey={activeTab} />
              ) : null}
              {activeTab === 'account' && loginStatus === 'authenticated' ? (
                <AccountSetting />
              ) : null}
            </Suspense>
          </div>
          <div className={style.footer}>
            <ContactWithUsIcon fontSize={16} />
            <Trans
              i18nKey={'com.affine.settings.suggestion-2'}
              components={{
                1: (
                  <span
                    className={style.link}
                    onClick={handleOpenStarAFFiNEModal}
                  />
                ),
                2: (
                  <span
                    className={style.link}
                    onClick={handleOpenIssueFeedbackModal}
                  />
                ),
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export const SettingModal = ({
  activeTab = 'appearance',
  workspaceMetadata = null,
  onSettingClick,
  ...modalProps
}: SettingProps) => {
  return (
    <Modal
      width={1080}
      height={760}
      contentOptions={{
        ['data-testid' as string]: 'setting-modal',
        style: {
          maxHeight: '85vh',
          maxWidth: '70vw',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
        },
      }}
      {...modalProps}
    >
      <Suspense fallback={<CenteredLoading />}>
        <SettingModalInner
          activeTab={activeTab}
          workspaceMetadata={workspaceMetadata}
          onSettingClick={onSettingClick}
          {...modalProps}
        />
      </Suspense>
    </Modal>
  );
};
