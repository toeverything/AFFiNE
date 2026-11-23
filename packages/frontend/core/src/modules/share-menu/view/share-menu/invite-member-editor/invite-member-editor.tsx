import {
  Button,
  Loading,
  Menu,
  MenuItem,
  MenuTrigger,
  notify,
  RowInput,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import {
  DocGrantedUsersService,
  type Member,
  MemberSearchService,
} from '@affine/core/modules/permissions';
import { UserFriendlyError } from '@affine/error';
import { DocRole, WorkspaceMemberStatus } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ArrowLeftBigIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import {
  type CompositionEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import { PlanTag } from '../plan-tag';
import { Scroller } from '../scroller';
import * as styles from './invite-member-editor.css';
import { MemberItem } from './member-item';
import { SelectedMemberItem } from './selected-member-item';

const getRoleName = (role: DocRole, t: ReturnType<typeof useI18n>) => {
  switch (role) {
    case DocRole.Manager:
      return t['com.affine.share-menu.option.permission.can-manage']();
    case DocRole.Editor:
      return t['com.affine.share-menu.option.permission.can-edit']();
    case DocRole.Reader:
      return t['com.affine.share-menu.option.permission.can-read']();
    default:
      return '';
  }
};

export const InviteMemberEditor = ({
  openPaywallModal,
  hittingPaywall,
  onClickCancel,
}: {
  hittingPaywall: boolean;
  openPaywallModal: () => void;
  onClickCancel: () => void;
}) => {
  const t = useI18n();
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const docGrantedUsersService = useService(DocGrantedUsersService);
  const [inviteDocRoleType, setInviteDocRoleType] = useState<DocRole>(
    DocRole.Manager
  );

  const memberSearchService = useService(MemberSearchService);

  useEffect(() => {
    // reset the search text when the component is mounted
    memberSearchService.reset();
    memberSearchService.loadMore();
  }, [memberSearchService]);

  const debouncedSearch = useMemo(
    () => debounce((value: string) => memberSearchService.search(value), 300),
    [memberSearchService]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [searchText, setSearchText] = useState('');

  const handleValueChange = useCallback(
    (value: string) => {
      setSearchText(value);
      if (!composing) {
        debouncedSearch(value);
      }
    },
    [composing, debouncedSearch]
  );
  const workspaceDialogService = useService(WorkspaceDialogService);

  const onInvite = useAsyncCallback(async () => {
    const selectedMemberIds = selectedMembers.map(member => member.id);
    track.$.sharePanel.$.inviteUserDocRole({
      control: 'member list',
      role: inviteDocRoleType,
    });
    try {
      await docGrantedUsersService.grantUsersRole(
        selectedMemberIds,
        inviteDocRoleType
      );
      onClickCancel();

      notify.success({
        title: t['Invitation sent'](),
      });
    } catch (error) {
      const err = UserFriendlyError.fromAny(error);
      notify.error({
        title: t[`error.${err.name}`](err.data),
      });
    }
  }, [
    docGrantedUsersService,
    inviteDocRoleType,
    onClickCancel,
    selectedMembers,
    t,
  ]);

  const handleCompositionStart: CompositionEventHandler<HTMLInputElement> =
    useCallback(() => {
      setComposing(true);
    }, []);

  const handleCompositionEnd: CompositionEventHandler<HTMLInputElement> =
    useCallback(
      e => {
        setComposing(false);
        debouncedSearch(e.currentTarget.value);
      },
      [debouncedSearch]
    );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);
  const onFocus = useCallback(() => {
    setFocused(true);
  }, []);
  const onBlur = useCallback(() => {
    setFocused(false);
  }, []);

  const handleRemoved = useCallback(
    (memberId: string) => {
      setSelectedMembers(prev => prev.filter(member => member.id !== memberId));
      focusInput();
    },
    [focusInput]
  );

  const switchToMemberManagementTab = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'workspace:members',
    });
  }, [workspaceDialogService]);

  const handleClickMember = useCallback(
    (member: Member) => {
      setSelectedMembers(prev => {
        if (prev.some(m => m.id === member.id)) {
          // if the member is already in the list, just return
          return prev;
        }
        return [...prev, member];
      });
      setSearchText('');
      memberSearchService.search('');
      focusInput();
    },
    [focusInput, memberSearchService]
  );

  const handleRoleChange = useCallback((role: DocRole) => {
    setInviteDocRoleType(role);
  }, []);

  return (
    <div className={styles.containerStyle}>
      <div className={styles.headerStyle} onClick={onClickCancel}>
        <ArrowLeftBigIcon className={styles.iconStyle} />
        {t['com.affine.share-menu.invite-editor.header']()}
      </div>
      <div className={styles.memberListStyle}>
        <div
          className={clsx(styles.InputContainer, {
            focus: focused,
          })}
        >
          <div className={styles.inlineMembersContainer}>
            {selectedMembers.map((member, idx) => {
              if (!member) {
                return null;
              }
              const onRemoved = () => handleRemoved(member.id);
              return (
                <SelectedMemberItem
                  key={member.id}
                  idx={idx}
                  onRemoved={onRemoved}
                  member={member}
                />
              );
            })}
            <RowInput
              ref={inputRef}
              value={searchText}
              onChange={handleValueChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={onFocus}
              onBlur={onBlur}
              autoFocus
              className={styles.searchInput}
              placeholder={
                selectedMembers.length
                  ? ''
                  : t['com.affine.share-menu.invite-editor.placeholder']()
              }
            />
          </div>
          {!selectedMembers.length ? null : (
            <RoleSelector
              openPaywallModal={openPaywallModal}
              hittingPaywall={hittingPaywall}
              inviteDocRoleType={inviteDocRoleType}
              onRoleChange={handleRoleChange}
            />
          )}
        </div>
        <div className={styles.resultContainer}>
          <Result onClickMember={handleClickMember} />
        </div>
      </div>
      <div className={styles.footerStyle}>
        <span
          className={styles.manageMemberStyle}
          onClick={switchToMemberManagementTab}
        >
          {t['com.affine.share-menu.invite-editor.manage-members']()}
        </span>
        <div className={styles.buttonsContainer}>
          <Button className={styles.button} onClick={onClickCancel}>
            {t['Cancel']()}
          </Button>
          <Button
            className={styles.button}
            variant="primary"
            disabled={!selectedMembers.length}
            onClick={onInvite}
          >
            {t['com.affine.share-menu.invite-editor.invite']()}
          </Button>
        </div>
      </div>
    </div>
  );
};

const Result = ({
  onClickMember,
}: {
  onClickMember: (member: Member) => void;
}) => {
  const memberSearchService = useService(MemberSearchService);
  const searchText = useLiveData(memberSearchService.searchText$);
  const result = useLiveData(memberSearchService.result$);
  const isLoading = useLiveData(memberSearchService.isLoading$);

  const activeMembers = useMemo(() => {
    return result.filter(
      member => member.status === WorkspaceMemberStatus.Accepted
    );
  }, [result]);

  const itemContentRenderer = useCallback(
    (_index: number, data: Member) => {
      return <MemberItem member={data} onSelect={onClickMember} />;
    },
    [onClickMember]
  );

  const t = useI18n();

  const loadMore = useCallback(() => {
    memberSearchService.loadMore();
  }, [memberSearchService]);

  if (!searchText) {
    return null;
  }

  if (!activeMembers || activeMembers.length === 0) {
    if (isLoading) {
      return <Loading />;
    }
    return (
      <div className={styles.noFound}>
        {t['com.affine.share-menu.invite-editor.no-found']()}
      </div>
    );
  }

  return activeMembers.length < 8 ? (
    <div>
      {activeMembers.map(member => (
        <MemberItem key={member.id} member={member} onSelect={onClickMember} />
      ))}
    </div>
  ) : (
    <Virtuoso
      components={{
        Scroller,
      }}
      data={activeMembers}
      itemContent={itemContentRenderer}
      endReached={loadMore}
    />
  );
};

const RoleSelector = ({
  openPaywallModal,
  hittingPaywall,
  inviteDocRoleType,
  onRoleChange,
}: {
  openPaywallModal: () => void;
  inviteDocRoleType: DocRole;
  onRoleChange: (role: DocRole) => void;
  hittingPaywall: boolean;
}) => {
  const t = useI18n();
  const currentRoleName = useMemo(
    () => getRoleName(inviteDocRoleType, t),
    [inviteDocRoleType, t]
  );

  const changeToAdmin = useCallback(
    () => onRoleChange(DocRole.Manager),
    [onRoleChange]
  );
  const changeToWrite = useCallback(() => {
    if (hittingPaywall) {
      openPaywallModal();
      return;
    }
    onRoleChange(DocRole.Editor);
  }, [hittingPaywall, onRoleChange, openPaywallModal]);
  const changeToRead = useCallback(() => {
    if (hittingPaywall) {
      openPaywallModal();
      return;
    }
    onRoleChange(DocRole.Reader);
  }, [hittingPaywall, onRoleChange, openPaywallModal]);
  return (
    <div className={styles.roleSelectorContainer}>
      <Menu
        contentOptions={{
          align: 'end',
        }}
        items={
          <>
            <MenuItem
              onSelect={changeToAdmin}
              selected={inviteDocRoleType === DocRole.Manager}
            >
              {t['com.affine.share-menu.option.permission.can-manage']()}
            </MenuItem>
            <MenuItem
              onSelect={changeToWrite}
              selected={inviteDocRoleType === DocRole.Editor}
            >
              <div className={styles.planTagContainer}>
                {t['com.affine.share-menu.option.permission.can-edit']()}
                {hittingPaywall ? <PlanTag /> : null}
              </div>
            </MenuItem>
            <MenuItem
              onSelect={changeToRead}
              selected={inviteDocRoleType === DocRole.Reader}
            >
              <div className={styles.planTagContainer}>
                {t['com.affine.share-menu.option.permission.can-read']()}
                {hittingPaywall ? <PlanTag /> : null}
              </div>
            </MenuItem>
          </>
        }
      >
        <MenuTrigger
          className={styles.menuTriggerStyle}
          variant="plain"
          contentStyle={{
            width: '100%',
          }}
        >
          {currentRoleName}
        </MenuTrigger>
      </Menu>
    </div>
  );
};
