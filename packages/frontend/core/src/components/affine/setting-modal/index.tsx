import { Loading, Scrollable } from '@affine/component';
import { WorkspaceDetailSkeleton } from '@affine/component/setting-components';
import type { ModalProps } from '@affine/component/ui/modal';
import { Modal } from '@affine/component/ui/modal';
import { AuthService } from '@affine/core/modules/cloud';
import { Trans } from '@affine/i18n';
import { ContactWithUsIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  type WorkspaceMetadata,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { AccountSetting } from './account-setting';
import { settingModalScrollContainerAtom } from './atoms';
import { GeneralSetting } from './general-setting';
import { IssueFeedbackModal } from './issue-feedback-modal';
import { SettingSidebar } from './setting-sidebar';
import { StarAFFiNEModal } from './star-affine-modal';
import * as style from './style.css';
import type { ActiveTab, GeneralSettingKey, WorkspaceSubTab } from './types';
import { GeneralSettingKeys } from './types';
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
  const loginStatus = useLiveData(useService(AuthService).session.status$);

  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalContentWrapperRef = useRef<HTMLDivElement>(null);
  const setSettingModalScrollContainer = useSetAtom(
    settingModalScrollContainerAtom
  );

  useLayoutEffect(() => {
    if (!modalProps.open) return;
    let animationFrameId: number;
    const onResize = debounce(() => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!modalContentRef.current || !modalContentWrapperRef.current) return;

        const wrapperWidth = modalContentWrapperRef.current.offsetWidth;
        const wrapperHeight = modalContentWrapperRef.current.offsetHeight;
        const contentWidth = modalContentRef.current.offsetWidth;

        const wrapper = modalContentWrapperRef.current;

        wrapper?.style.setProperty(
          '--setting-modal-width',
          `${wrapperWidth}px`
        );
        wrapper?.style.setProperty(
          '--setting-modal-height',
          `${wrapperHeight}px`
        );
        wrapper?.style.setProperty(
          '--setting-modal-content-width',
          `${contentWidth}px`
        );
        wrapper?.style.setProperty(
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

  useEffect(() => {
    setSettingModalScrollContainer(modalContentWrapperRef.current);
    return () => {
      setSettingModalScrollContainer(null);
    };
  }, [setSettingModalScrollContainer]);

  const onTabChange = useCallback(
    (key: ActiveTab, meta: WorkspaceMetadata | null) => {
      onSettingClick({ activeTab: key, workspaceMetadata: meta });
    },
    [onSettingClick]
  );
  const [openIssueFeedbackModal, setOpenIssueFeedbackModal] = useState(false);
  const [openStarAFFiNEModal, setOpenStarAFFiNEModal] = useState(false);

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
      <Scrollable.Root>
        <Scrollable.Viewport
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
            <StarAFFiNEModal
              open={openStarAFFiNEModal}
              setOpen={setOpenStarAFFiNEModal}
            />
            <IssueFeedbackModal
              open={openIssueFeedbackModal}
              setOpen={setOpenIssueFeedbackModal}
            />
          </div>
          <Scrollable.Scrollbar />
        </Scrollable.Viewport>
      </Scrollable.Root>
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
      width={1280}
      height={920}
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
