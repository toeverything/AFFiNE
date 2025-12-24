import {
  Divider,
  IconButton,
  Menu,
  MenuItem,
  type MenuRef,
  RowInput,
  Scrollable,
} from '@affine/component';
import { TagService, useDeleteTagConfirmModal } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { DoneIcon, MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { clamp } from 'lodash-es';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { useAsyncCallback } from '../hooks/affine-async-hooks';
import { ConfigModal } from '../mobile';
import { InlineTagList } from './inline-tag-list';
import * as styles from './styles.css';
import { TagItem } from './tag';
import { TagEditMenu } from './tag-edit-menu';
import type { TagColor, TagLike } from './types';

export interface TagsEditorProps {
  tags: TagLike[]; // candidates to show in the tag dropdown
  selectedTags: string[];
  onCreateTag: (name: string, color: string) => TagLike;
  onSelectTag: (tagId: string) => void; // activate tag
  onDeselectTag: (tagId: string) => void; // deactivate tag
  tagColors: TagColor[];
  onTagChange: (id: string, property: keyof TagLike, value: string) => void;
  onDeleteTag: (id: string) => void; // a candidate to be deleted
  jumpToTag?: (id: string) => void;
  tagMode: 'inline-tag' | 'db-label';
  style?: React.CSSProperties;
}

export interface TagsInlineEditorProps extends TagsEditorProps {
  placeholder?: ReactNode;
  className?: string;
  readonly?: boolean;
  title?: ReactNode; // only used for mobile
  modalMenu?: boolean;
  menuClassName?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<MenuRef>;
  onEditorClose?: () => void;
}

type TagOption = TagLike | { readonly create: true; readonly value: string };

const isCreateNewTag = (
  tagOption: TagOption
): tagOption is { readonly create: true; readonly value: string } => {
  return 'create' in tagOption;
};

export const TagsEditor = ({
  tags,
  selectedTags,
  onSelectTag,
  onDeselectTag,
  onCreateTag,
  tagColors,
  onDeleteTag,
  onTagChange,
  jumpToTag,
  tagMode,
  style,
}: TagsEditorProps) => {
  const t = useI18n();
  const [inputValue, setInputValue] = useState('');

  const trimmedInputValue = inputValue.trim();

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(trimmedInputValue.toLowerCase())
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const exactMatch = filteredTags.find(tag => tag.name === trimmedInputValue);
  const showCreateTag = !exactMatch && trimmedInputValue;

  // tag option candidates to show in the tag dropdown
  const tagOptions: TagOption[] = useMemo(() => {
    if (showCreateTag) {
      return [
        { create: true, value: trimmedInputValue } as const,
        ...filteredTags,
      ];
    } else {
      return filteredTags;
    }
  }, [filteredTags, showCreateTag, trimmedInputValue]);

  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [focusedInlineIndex, setFocusedInlineIndex] = useState<number>(
    selectedTags.length
  );

  // -1: no focus
  const safeFocusedIndex = clamp(focusedIndex, -1, tagOptions.length - 1);
  // inline tags focus index can go beyond the length of tagIds
  // using -1 and tagIds.length to make keyboard navigation easier
  const safeInlineFocusedIndex = clamp(
    focusedInlineIndex,
    -1,
    selectedTags.length
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const onInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (value.length > 0) {
        setFocusedInlineIndex(selectedTags.length);
      }
    },
    [selectedTags.length]
  );

  const onToggleTag = useCallback(
    (id: string) => {
      if (!selectedTags.includes(id)) {
        onSelectTag(id);
      } else {
        onDeselectTag(id);
      }
    },
    [selectedTags, onSelectTag, onDeselectTag]
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const [nextColor, rotateNextColor] = useReducer(
    color => {
      const idx = tagColors.findIndex(c => c.value === color);
      return tagColors[(idx + 1) % tagColors.length].value;
    },
    tagColors[Math.floor(Math.random() * tagColors.length)].value
  );

  const handleCreateTag = useCallback(
    (name: string) => {
      rotateNextColor();
      const newTag = onCreateTag(name.trim(), nextColor);
      return newTag.id;
    },
    [onCreateTag, nextColor]
  );

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      onDeleteTag(tagId);
    },
    [onDeleteTag]
  );

  const onSelectTagOption = useCallback(
    (tagOption: TagOption) => {
      const id = isCreateNewTag(tagOption)
        ? handleCreateTag(tagOption.value)
        : tagOption.id;
      onToggleTag(id);
      setInputValue('');
      focusInput();
      setFocusedIndex(-1);
      setFocusedInlineIndex(selectedTags.length + 1);
    },
    [handleCreateTag, onToggleTag, focusInput, selectedTags.length]
  );
  const onEnter = useCallback(() => {
    if (safeFocusedIndex >= 0) {
      onSelectTagOption(tagOptions[safeFocusedIndex]);
    }
  }, [onSelectTagOption, safeFocusedIndex, tagOptions]);

  const handleUntag = useCallback(
    (id: string) => {
      onToggleTag(id);
      focusInput();
    },
    [onToggleTag, focusInput]
  );

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (inputValue.length > 0 || selectedTags.length === 0) {
          return;
        }
        e.preventDefault();
        const index =
          safeInlineFocusedIndex < 0 ||
          safeInlineFocusedIndex >= selectedTags.length
            ? selectedTags.length - 1
            : safeInlineFocusedIndex;
        const tagToRemove = selectedTags.at(index);
        if (tagToRemove) {
          onDeselectTag(tagToRemove);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const newFocusedIndex = clamp(
          safeFocusedIndex + (e.key === 'ArrowUp' ? -1 : 1),
          0,
          tagOptions.length - 1
        );
        scrollContainerRef.current
          ?.querySelector(
            `.${styles.tagSelectorItem}:nth-child(${newFocusedIndex + 1})`
          )
          ?.scrollIntoView({ block: 'nearest' });
        setFocusedIndex(newFocusedIndex);
        // reset inline focus
        setFocusedInlineIndex(selectedTags.length + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (inputValue.length > 0 || selectedTags.length === 0) {
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
      inputValue,
      safeInlineFocusedIndex,
      selectedTags,
      onDeselectTag,
      safeFocusedIndex,
      tagOptions.length,
    ]
  );

  return (
    <div
      style={style}
      data-testid="tags-editor-popup"
      className={
        BUILD_CONFIG.isMobileEdition
          ? styles.tagsEditorRootMobile
          : styles.tagsEditorRoot
      }
    >
      <div className={styles.tagsEditorSelectedTags}>
        <InlineTagList
          tagMode={tagMode}
          tags={tags.filter(tag => selectedTags.includes(tag.id))}
          focusedIndex={safeInlineFocusedIndex}
          onRemoved={handleUntag}
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
        </InlineTagList>

        {BUILD_CONFIG.isMobileEdition ? null : (
          <MenuItem
            className={styles.tagsEditorDoneButton}
            prefixIcon={<DoneIcon />}
          />
        )}
      </div>
      {BUILD_CONFIG.isMobileEdition ? null : (
        <Divider size="thinner" className={styles.tagDivider} />
      )}
      <div className={styles.tagsEditorTagsSelector}>
        <div className={styles.tagsEditorTagsSelectorHeader}>
          {t['com.affine.page-properties.tags.selector-header-title']()}
        </div>
        <Scrollable.Root>
          <Scrollable.Viewport
            ref={scrollContainerRef}
            className={styles.tagSelectorTagsScrollContainer}
          >
            {tagOptions.length === 0 && (
              <div className={styles.tagSelectorEmpty}>Nothing here yet</div>
            )}

            {tagOptions.map((tag, idx) => {
              const commonProps = {
                ...(safeFocusedIndex === idx ? { focused: 'true' } : {}),
                onClick: () => onSelectTagOption(tag),
                onMouseEnter: () => setFocusedIndex(idx),
                ['data-testid']: 'tag-selector-item',
                ['data-focused']: safeFocusedIndex === idx,
                className: styles.tagSelectorItem,
              };
              if (isCreateNewTag(tag)) {
                return (
                  <div key={tag.value + '.' + idx} {...commonProps}>
                    {t['Create']()}{' '}
                    <TagItem
                      mode={tagMode}
                      tag={{
                        id: 'create-new-tag',
                        name: inputValue,
                        color: nextColor,
                      }}
                    />
                  </div>
                );
              } else {
                return (
                  <div
                    key={tag.id}
                    {...commonProps}
                    data-tag-id={tag.id}
                    data-tag-value={tag.name}
                  >
                    <TagItem maxWidth="100%" tag={tag} mode={tagMode} />
                    <div className={styles.spacer} />
                    <TagEditMenu
                      tag={tag}
                      onTagDelete={handleDeleteTag}
                      onTagChange={(property, value) => {
                        onTagChange(tag.id, property, value);
                      }}
                      jumpToTag={jumpToTag}
                      colors={tagColors}
                    >
                      <IconButton className={styles.tagEditIcon}>
                        <MoreHorizontalIcon />
                      </IconButton>
                    </TagEditMenu>
                  </div>
                );
              }
            })}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar style={{ transform: 'translateX(6px)' }} />
        </Scrollable.Root>
      </div>
    </div>
  );
};

const MobileInlineEditor = ({
  readonly,
  placeholder,
  className,
  title,
  style,
  onEditorClose,
  ref,
  ...props
}: TagsInlineEditorProps) => {
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

  const empty = !props.selectedTags || props.selectedTags.length === 0;
  const selectedTags = useMemo(() => {
    return props.selectedTags
      .map(id => props.tags.find(tag => tag.id === id))
      .filter(tag => tag !== undefined);
  }, [props.selectedTags, props.tags]);
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
        <TagsEditor {...props} />
      </ConfigModal>
      <div
        className={clsx(styles.tagsInlineEditor, className)}
        data-empty={empty}
        data-readonly={readonly}
        onClick={() => setEditing(true)}
        style={style}
      >
        {empty ? (
          placeholder
        ) : (
          <InlineTagList {...props} tags={selectedTags} onRemoved={undefined} />
        )}
      </div>
    </>
  );
};

const DesktopTagsInlineEditor = ({
  readonly,
  placeholder,
  className,
  modalMenu,
  menuClassName,
  style,
  ref,
  onEditorClose,
  ...props
}: TagsInlineEditorProps) => {
  const empty = !props.selectedTags || props.selectedTags.length === 0;
  const selectedTags = useMemo(() => {
    return props.selectedTags
      .map(id => props.tags.find(tag => tag.id === id))
      .filter(tag => tag !== undefined);
  }, [props.selectedTags, props.tags]);
  return (
    <Menu
      ref={ref}
      contentOptions={{
        side: 'bottom',
        align: 'start',
        sideOffset: 0,
        avoidCollisions: false,
        className: clsx(styles.tagsMenu, menuClassName),
        onClick(e) {
          e.stopPropagation();
        },
      }}
      rootOptions={{
        modal: modalMenu,
        onClose: onEditorClose,
      }}
      items={<TagsEditor {...props} />}
    >
      <div
        className={clsx(styles.tagsInlineEditor, className)}
        data-empty={empty}
        data-readonly={readonly}
        style={style}
      >
        {empty ? (
          placeholder
        ) : (
          <InlineTagList
            {...props}
            title=""
            tags={selectedTags}
            onRemoved={undefined}
          />
        )}
      </div>
    </Menu>
  );
};

export const TagsInlineEditor = BUILD_CONFIG.isMobileEdition
  ? MobileInlineEditor
  : DesktopTagsInlineEditor;

export const WorkspaceTagsInlineEditor = ({
  selectedTags,
  onDeselectTag,
  ref,
  onEditorClose,
  ...otherProps
}: Omit<
  TagsInlineEditorProps,
  'tags' | 'onCreateTag' | 'onDeleteTag' | 'tagColors' | 'onTagChange'
>) => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tagList.tagMetas$);
  const openDeleteTagConfirmModal = useDeleteTagConfirmModal();
  const tagColors = tagService.tagColors;
  const adaptedTagColors = useMemo(() => {
    return tagColors.map(color => ({
      id: color[0],
      value: color[1],
      name: color[0],
    }));
  }, [tagColors]);

  const onDeleteTag = useAsyncCallback(
    async (tagId: string) => {
      if (await openDeleteTagConfirmModal([tagId])) {
        tagService.tagList.deleteTag(tagId);
        if (selectedTags.includes(tagId)) {
          onDeselectTag(tagId);
        }
      }
    },
    [tagService.tagList, openDeleteTagConfirmModal, selectedTags, onDeselectTag]
  );
  const onCreateTag = useCallback(
    (name: string, color: string) => {
      const newTag = tagService.tagList.createTag(name, color);
      return {
        id: newTag.id,
        name: newTag.value$.value,
        color: newTag.color$.value,
      };
    },
    [tagService.tagList]
  );
  const onTagChange = useCallback(
    (id: string, property: keyof TagLike, value: string) => {
      if (property === 'name') {
        tagService.tagList.tagByTagId$(id).value?.rename(value);
      } else if (property === 'color') {
        tagService.tagList.tagByTagId$(id).value?.changeColor(value);
      }
    },
    [tagService.tagList]
  );
  return (
    <TagsInlineEditor
      tags={tags}
      selectedTags={selectedTags}
      onDeselectTag={onDeselectTag}
      tagColors={adaptedTagColors}
      onCreateTag={onCreateTag}
      onDeleteTag={onDeleteTag}
      onTagChange={onTagChange}
      ref={ref}
      onEditorClose={onEditorClose}
      {...otherProps}
    />
  );
};
