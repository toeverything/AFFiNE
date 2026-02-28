import { Avatar, notify } from '@affine/component';
import {
  type ExistedUserInfo,
  type UserListService,
  type UserService,
} from '@blocksuite/affine/shared/services';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import clsx from 'clsx';
import {
  type ChangeEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { useSignalValue } from '../../../../../modules/doc-info/utils';
import { Spinner } from '../../../components/loading';
import { useMemberInfo } from '../../../hooks/use-member-info';
import * as styles from './style.css';

type BaseOptions = {
  userService: UserService;
  userListService: UserListService;
  onComplete: () => void;
};

export type MemberManagerOptions =
  | ({
      multiple: true;
      value: ReadonlySignal<string[]>;
      onChange: (value: string[]) => void;
    } & BaseOptions)
  | ({
      multiple: false;
      value: ReadonlySignal<string>;
      onChange: (value?: string) => void;
    } & BaseOptions);

class MemberManager {
  selectedMembers = computed(() => {
    if (this.ops.multiple) {
      return this.ops.value.value;
    }
    return this.ops.value.value ? [this.ops.value.value] : [];
  });

  selectedMemberId = signal<string | null>(null);

  filteredMembers = computed(() => {
    const isSearching = this.userListService.searchText$.value !== '';
    if (isSearching) {
      return this.ops.userListService.users$.value.filter(
        member =>
          !member.removed && !this.selectedMembers.value.includes(member.id)
      );
    } else {
      const currentUser = this.ops.userService.currentUserInfo$.value;
      return [
        ...(currentUser ? [currentUser] : []),
        ...this.ops.userListService.users$.value.filter(
          member => member.id !== currentUser?.id
        ),
      ].filter(
        member =>
          !member.removed && !this.selectedMembers.value.includes(member.id)
      );
    }
  });

  constructor(private readonly ops: MemberManagerOptions) {}

  get userService() {
    return this.ops.userService;
  }

  get userListService() {
    return this.ops.userListService;
  }
  search = (searchText: string): void => {
    this.userListService.search(searchText);
  };

  selectMember = (memberId: string): void => {
    if (this.ops.multiple) {
      if (this.selectedMembers.value.includes(memberId)) {
        notify.error({
          title: 'Member already exists',
          message: 'The member has already been selected',
        });
        return;
      }
      this.ops.onChange([...this.selectedMembers.value, memberId]);
      this.moveSelectionAfterSelect(memberId);
      this.ops.userListService.search('');
    } else {
      this.ops.onChange(memberId);
    }
  };

  moveSelectionAfterSelect = (selectedId: string): void => {
    const members = this.filteredMembers.value;
    const currentIndex = members.findIndex(member => member.id === selectedId);

    if (currentIndex === -1) {
      return;
    }

    const updatedMembers = this.filteredMembers.value;
    const nextMember = updatedMembers[currentIndex + 1];
    if (nextMember) {
      this.selectedMemberId.value = nextMember.id;
      return;
    }
    const prevMember = updatedMembers[currentIndex - 1];
    if (prevMember) {
      this.selectedMemberId.value = prevMember.id;
      return;
    }

    this.selectedMemberId.value = null;
  };

  removeMember = (memberId: string, e?: MouseEvent): void => {
    e?.stopPropagation();
    if (this.ops.multiple) {
      this.ops.onChange(this.ops.value.value.filter(id => id !== memberId));
    } else {
      this.ops.onChange(undefined);
    }
  };

  complete = (): void => {
    this.ops.onComplete();
  };

  getSelectedIndex = (): number => {
    if (!this.selectedMemberId.value) return -1;

    const members = this.filteredMembers.value;
    return members.findIndex(
      member => member.id === this.selectedMemberId.value
    );
  };

  moveSelectionUp = (): void => {
    const members = this.filteredMembers.value;
    if (members.length === 0) return;

    const currentIndex = this.getSelectedIndex();
    let newIndex = currentIndex > 0 ? currentIndex - 1 : members.length - 1;
    this.selectedMemberId.value = members[newIndex].id;
  };

  moveSelectionDown = (): void => {
    const members = this.filteredMembers.value;
    if (members.length === 0) return;

    const currentIndex = this.getSelectedIndex();
    let newIndex = currentIndex < members.length - 1 ? currentIndex + 1 : 0;
    this.selectedMemberId.value = members[newIndex].id;
  };

  scrollSelectedIntoView = (
    memberListRef: React.RefObject<HTMLDivElement | null>
  ): void => {
    if (!memberListRef.current) return;

    const selectedElement = memberListRef.current.querySelector(
      `[data-selected="true"]`
    );
    if (selectedElement) {
      selectedElement.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  };

  confirmSelection = (): void => {
    if (
      this.selectedMemberId.value &&
      this.filteredMembers.value.some(v => v.id === this.selectedMemberId.value)
    ) {
      this.selectMember(this.selectedMemberId.value);
    }
  };
}

export const MemberListItem = (props: {
  member: ExistedUserInfo;
  memberManager: MemberManager;
  isSelected?: boolean;
}) => {
  const { member, memberManager, isSelected } = props;

  const handleClick = () => {
    memberManager.selectMember(member.id);
  };

  const handleMouseEnter = () => {
    memberManager.selectedMemberId.value = member.id;
  };

  return (
    <div
      className={clsx(
        styles.memberItem,
        isSelected && styles.memberSelectedItem
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      data-selected={isSelected ? 'true' : 'false'}
    >
      <div className={styles.avatar}>
        <Avatar
          name={member.removed ? undefined : (member.name ?? undefined)}
          url={member.avatar}
          size={24}
        />
      </div>
      <div className={styles.memberName}>{member.name}</div>
    </div>
  );
};

export const MemberPreview = ({
  memberId,
  memberManager,
  onDelete,
}: {
  memberId: string;
  memberManager: MemberManager;
  onDelete?: () => void;
}) => {
  const userInfo = useMemberInfo(memberId, memberManager.userService);
  if (!userInfo) {
    return null;
  }
  return (
    <div className={styles.memberPreviewContainer}>
      <Avatar
        name={userInfo.removed ? undefined : (userInfo.name ?? undefined)}
        className={styles.avatar}
        url={!userInfo.removed ? userInfo.avatar : undefined}
        size={16}
      />
      <div className={styles.memberName}>
        {userInfo.removed ? 'Deleted user' : userInfo.name || 'Unnamed'}
      </div>
      {onDelete && (
        <div className={styles.memberDeleteIcon} onClick={onDelete}>
          ✕
        </div>
      )}
    </div>
  );
};

export const MultiMemberSelect: React.FC<MemberManagerOptions> = props => {
  const inputRef = useRef<HTMLInputElement>(null);
  const memberListRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memberManager = useMemo(() => new MemberManager(props), []);

  const isLoading = useSignalValue(memberManager.userListService.isLoading$);
  const selectedMembers = useSignalValue(memberManager.selectedMembers);
  const filteredMemberList = useSignalValue(memberManager.filteredMembers);
  const selectedMemberId = useSignalValue(memberManager.selectedMemberId);

  useEffect(() => {
    memberManager.search('');
    const input = inputRef.current;
    if (input) {
      input.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        e.stopPropagation();

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          memberManager.moveSelectionDown();
          memberManager.scrollSelectedIntoView(memberListRef);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          memberManager.moveSelectionUp();
          memberManager.scrollSelectedIntoView(memberListRef);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          memberManager.confirmSelection();
        } else if (
          e.key === 'Backspace' &&
          memberManager.userListService.searchText$.value === ''
        ) {
          const selectedMembers = memberManager.selectedMembers.value;
          const lastId = selectedMembers[selectedMembers.length - 1];
          if (lastId) {
            memberManager.removeMember(lastId);
          }
        } else if (e.key === 'Escape') {
          memberManager.complete();
        }
      };

      input.addEventListener('keydown', handleKeyDown);
      return () => {
        input.removeEventListener('keydown', handleKeyDown);
      };
    }
    return;
  }, [memberManager]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    memberManager.search(event.target.value);
  };

  return (
    <div
      data-peek-view-wrapper="true"
      className={styles.multiMemberSelectContainer}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={styles.memberInputContainer}>
        {selectedMembers.map(memberId => (
          <MemberPreview
            key={memberId}
            memberId={memberId}
            memberManager={memberManager}
            onDelete={() => memberManager.removeMember(memberId)}
          />
        ))}
        <input
          ref={inputRef}
          className={styles.memberSearchInput}
          placeholder={selectedMembers.length > 0 ? '' : 'Search members...'}
          value={memberManager.userListService.searchText$.value}
          onChange={handleInputChange}
        />
      </div>
      <div className={styles.memberListContainer} ref={memberListRef}>
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <Spinner />
            Loading...
          </div>
        ) : filteredMemberList.length === 0 ? (
          <div className={styles.noResultContainer}>No results</div>
        ) : (
          filteredMemberList.map(member => (
            <MemberListItem
              key={member.id}
              member={member as ExistedUserInfo}
              memberManager={memberManager}
              isSelected={member.id === selectedMemberId}
            />
          ))
        )}
      </div>
    </div>
  );
};
