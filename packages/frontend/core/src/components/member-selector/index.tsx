import {
  Avatar,
  Divider,
  Menu,
  MenuItem,
  type MenuRef,
  RowInput,
  Scrollable,
} from '@affine/component';
import {
  type Member,
  MemberSearchService,
} from '@affine/core/modules/permissions';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { clamp, debounce } from 'lodash-es';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ConfigModal } from '../mobile';
import { InlineMemberList } from './inline-member-list';
import * as styles from './styles.css';

export interface MemberSelectorProps {
  selected: string[];
  style?: React.CSSProperties;
  className?: string;
  onChange: (selected: string[]) => void;
}

export interface MemberSelectorInlineProps extends MemberSelectorProps {
  modalMenu?: boolean;
  menuClassName?: string;
  readonly?: boolean;
  title?: ReactNode; // only used for mobile
  placeholder?: ReactNode;
  ref?: React.Ref<MenuRef>;
  onEditorClose?: () => void;
}

interface MemberSelectItemProps {
  member: Member;
  style?: React.CSSProperties;
}

const MemberSelectItem = ({ member, style }: MemberSelectItemProps) => {
  const { name, avatarUrl } = member;

  return (
    <div className={styles.memberItemListMode} style={style}>
      <Avatar
        url={avatarUrl}
        name={name ?? ''}
        size={20}
        className={styles.memberItemAvatar}
      />
      <div className={styles.memberItemLabel}>{name}</div>
    </div>
  );
};

export const MemberSelector = ({
  selected,
  className,
  onChange,
  style,
}: MemberSelectorProps) => {
  const [inputValue, setInputValue] = useState('');
  const memberSearchService = useService(MemberSearchService);

  const searchedMembers = useLiveData(memberSearchService.result$);

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

  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [focusedInlineIndex, setFocusedInlineIndex] = useState<number>(-1);

  // -1: no focus
  const safeFocusedIndex = clamp(focusedIndex, -1, searchedMembers.length - 1);
  // inline tags focus index can go beyond the length of tagIds
  // using -1 and tagIds.length to make keyboard navigation easier
  const safeInlineFocusedIndex = clamp(focusedInlineIndex, -1, selected.length);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const onInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (value.length > 0) {
        setFocusedInlineIndex(selected.length);
      }
      debouncedSearch(value.trim());
    },
    [debouncedSearch, selected.length]
  );

  const onToggleMember = useCallback(
    (id: string) => {
      if (!selected.includes(id)) {
        onChange([...selected, id]);
      } else {
        onChange(selected.filter(itemId => itemId !== id));
      }
    },
    [selected, onChange]
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const onSelectTagOption = useCallback(
    (member: Member) => {
      onToggleMember(member.id);
      setInputValue('');
      focusInput();
      setFocusedIndex(-1);
      setFocusedInlineIndex(selected.length + 1);
    },
    [onToggleMember, focusInput, selected.length]
  );
  const onEnter = useCallback(() => {
    if (safeFocusedIndex >= 0) {
      onSelectTagOption(searchedMembers[safeFocusedIndex]);
    }
  }, [onSelectTagOption, safeFocusedIndex, searchedMembers]);

  const handleUnselectMember = useCallback(
    (id: string) => {
      onToggleMember(id);
      focusInput();
    },
    [onToggleMember, focusInput]
  );

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (inputValue.length > 0 || selected.length === 0) {
          return;
        }
        e.preventDefault();
        const index =
          safeInlineFocusedIndex < 0 ||
          safeInlineFocusedIndex >= selected.length
            ? selected.length - 1
            : safeInlineFocusedIndex;
        const memberToRemove = selected.at(index);
        if (memberToRemove) {
          handleUnselectMember(memberToRemove);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const newFocusedIndex = clamp(
          safeFocusedIndex + (e.key === 'ArrowUp' ? -1 : 1),
          0,
          searchedMembers.length - 1
        );
        scrollContainerRef.current
          ?.querySelector(
            `.${styles.memberSelectorItem}:nth-child(${newFocusedIndex + 1})`
          )
          ?.scrollIntoView({ block: 'nearest' });
        setFocusedIndex(newFocusedIndex);
        // reset inline focus
        setFocusedInlineIndex(selected.length + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (inputValue.length > 0 || selected.length === 0) {
          return;
        }
        const newItemToFocus =
          e.key === 'ArrowLeft'
            ? safeInlineFocusedIndex - 1
            : safeInlineFocusedIndex + 1;

        e.preventDefault();
        setFocusedInlineIndex(newItemToFocus);
        // reset tag list focus
        setFocusedIndex(-1);
      }
    },
    [
      inputValue.length,
      selected,
      safeInlineFocusedIndex,
      handleUnselectMember,
      safeFocusedIndex,
      searchedMembers.length,
    ]
  );

  return (
    <div
      style={style}
      data-testid="tags-editor-popup"
      className={clsx(
        className,
        BUILD_CONFIG.isMobileEdition
          ? styles.memberSelectorRootMobile
          : styles.memberSelectorRoot
      )}
    >
      <div className={styles.memberSelectorSelectedTags}>
        <InlineMemberList
          members={selected}
          onRemove={handleUnselectMember}
          focusedIndex={safeInlineFocusedIndex}
        >
          <RowInput
            ref={inputRef}
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={onInputKeyDown}
            onEnter={onEnter}
            autoFocus
            className={styles.searchInput}
            placeholder="Type here ..."
          />
        </InlineMemberList>
        {BUILD_CONFIG.isMobileEdition ? null : (
          <MenuItem
            className={styles.memberSelectorDoneButton}
            prefixIcon={<DoneIcon />}
          />
        )}
      </div>
      {BUILD_CONFIG.isMobileEdition ? null : (
        <Divider size="thinner" className={styles.memberDivider} />
      )}
      <div className={styles.memberSelectorBody}>
        <Scrollable.Root>
          <Scrollable.Viewport
            ref={scrollContainerRef}
            className={styles.memberSelectorScrollContainer}
          >
            {searchedMembers.length === 0 && (
              <div className={styles.memberSelectorEmpty}>Nothing here yet</div>
            )}

            {searchedMembers.map((member, idx) => {
              const commonProps = {
                ...(safeFocusedIndex === idx ? { focused: 'true' } : {}),
                onClick: () => onSelectTagOption(member),
                onMouseEnter: () => setFocusedIndex(idx),
                ['data-testid']: 'tag-selector-item',
                ['data-focused']: safeFocusedIndex === idx,
                className: styles.memberSelectorItem,
              };

              return (
                <div
                  key={member.id}
                  {...commonProps}
                  data-member-id={member.id}
                  data-member-name={member.name}
                >
                  <MemberSelectItem member={member} />
                </div>
              );
            })}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar style={{ transform: 'translateX(6px)' }} />
        </Scrollable.Root>
      </div>
    </div>
  );
};

const MobileMemberSelectorInline = ({
  readonly,
  placeholder,
  className,
  title,
  style,
  onEditorClose,
  ref,
  ...props
}: MemberSelectorInlineProps) => {
  const [editing, setEditing] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      changeOpen: (open: boolean) => {
        setEditing(open);
        if (!open) {
          onEditorClose?.();
        }
      },
    }),
    [onEditorClose]
  );

  const empty = !props.selected || props.selected.length === 0;
  return (
    <>
      <ConfigModal
        title={title}
        open={editing}
        onOpenChange={setEditing}
        onBack={() => {
          setEditing(false);
          onEditorClose?.();
        }}
      >
        <MemberSelector {...props} />
      </ConfigModal>
      <div
        className={clsx(styles.membersSelectorInline, className)}
        data-empty={empty}
        data-readonly={readonly}
        onClick={() => setEditing(true)}
        style={style}
      >
        {empty ? placeholder : <InlineMemberList members={props.selected} />}
      </div>
    </>
  );
};

const DesktopMemberSelectorInline = ({
  readonly,
  placeholder,
  className,
  modalMenu,
  menuClassName,
  style,
  selected,
  ref,
  onEditorClose,
  ...props
}: MemberSelectorInlineProps) => {
  const empty = !selected || selected.length === 0;
  return (
    <Menu
      ref={ref}
      contentOptions={{
        side: 'bottom',
        align: 'start',
        sideOffset: 0,
        avoidCollisions: false,
        className: clsx(styles.memberSelectorMenu, menuClassName),
        onClick(e) {
          e.stopPropagation();
        },
      }}
      rootOptions={{
        open: readonly ? false : undefined,
        modal: modalMenu,
        onClose: onEditorClose,
      }}
      items={<MemberSelector selected={selected} {...props} />}
    >
      <div
        className={clsx(styles.membersSelectorInline, className)}
        data-empty={empty}
        data-readonly={readonly}
        style={style}
      >
        {empty ? placeholder : <InlineMemberList members={selected} />}
      </div>
    </Menu>
  );
};

export const MemberSelectorInline = BUILD_CONFIG.isMobileEdition
  ? MobileMemberSelectorInline
  : DesktopMemberSelectorInline;
