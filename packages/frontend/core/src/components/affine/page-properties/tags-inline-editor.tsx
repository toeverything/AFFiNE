import type { MenuProps } from '@affine/component';
import {
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  RowInput,
  Scrollable,
} from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceLegacyProperties } from '@affine/core/modules/properties';
import type { Tag } from '@affine/core/modules/tag';
import { DeleteTagConfirmModal, TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, MoreHorizontalIcon, TagsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { clamp } from 'lodash-es';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';

import { TagItem, TempTagItem } from '../../page-list';
import * as styles from './tags-inline-editor.css';

interface TagsEditorProps {
  pageId: string;
  readonly?: boolean;
  focusedIndex?: number;
}

interface InlineTagsListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>,
    Omit<TagsEditorProps, 'onOptionsChange'> {
  onRemove?: () => void;
}

export const InlineTagsList = ({
  pageId,
  readonly,
  children,
  focusedIndex,
  onRemove,
}: PropsWithChildren<InlineTagsListProps>) => {
  const tagList = useService(TagService).tagList;
  const tags = useLiveData(tagList.tags$);
  const tagIds = useLiveData(tagList.tagIdsByPageId$(pageId));

  return (
    <div className={styles.inlineTagsContainer} data-testid="inline-tags-list">
      {tagIds.map((tagId, idx) => {
        const tag = tags.find(t => t.id === tagId);
        if (!tag) {
          return null;
        }
        const onRemoved = readonly
          ? undefined
          : () => {
              tag.untag(pageId);
              onRemove?.();
            };
        return (
          <TagItem
            key={tagId}
            idx={idx}
            focused={focusedIndex === idx}
            onRemoved={onRemoved}
            mode="inline"
            tag={tag}
          />
        );
      })}
      {children}
    </div>
  );
};

export const EditTagMenu = ({
  tagId,
  onTagDelete,
  children,
}: PropsWithChildren<{
  tagId: string;
  onTagDelete: (tagIds: string[]) => void;
}>) => {
  const t = useI18n();
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const tagService = useService(TagService);
  const tagList = tagService.tagList;
  const tag = useLiveData(tagList.tagByTagId$(tagId));
  const tagColor = useLiveData(tag?.color$);
  const tagValue = useLiveData(tag?.value$);
  const navigate = useNavigateHelper();

  const menuProps = useMemo(() => {
    const updateTagName = (name: string) => {
      if (name.trim() === '') {
        return;
      }
      tag?.rename(name);
    };

    return {
      contentOptions: {
        onClick(e) {
          e.stopPropagation();
        },
      },
      items: (
        <>
          <Input
            defaultValue={tagValue}
            onBlur={e => {
              updateTagName(e.currentTarget.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateTagName(e.currentTarget.value);
              }
              e.stopPropagation();
            }}
            placeholder={t['Untitled']()}
          />
          <MenuSeparator />
          <MenuItem
            prefixIcon={<DeleteIcon />}
            type="danger"
            onClick={() => {
              onTagDelete([tag?.id || '']);
            }}
          >
            {t['Delete']()}
          </MenuItem>
          <MenuItem
            prefixIcon={<TagsIcon />}
            onClick={() => {
              navigate.jumpToTag(legacyProperties.workspaceId, tag?.id || '');
            }}
          >
            {t['com.affine.page-properties.tags.open-tags-page']()}
          </MenuItem>
          <MenuSeparator />
          <Scrollable.Root>
            <Scrollable.Viewport className={styles.menuItemList}>
              {tagService.tagColors.map(([name, color], i) => (
                <MenuItem
                  key={i}
                  checked={tagColor === color}
                  prefixIcon={
                    <div key={i} className={styles.tagColorIconWrapper}>
                      <div
                        className={styles.tagColorIcon}
                        style={{
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  }
                  onClick={() => {
                    tag?.changeColor(color);
                  }}
                >
                  {name}
                </MenuItem>
              ))}
              <Scrollable.Scrollbar className={styles.menuItemListScrollbar} />
            </Scrollable.Viewport>
          </Scrollable.Root>
        </>
      ),
    } satisfies Partial<MenuProps>;
  }, [
    legacyProperties.workspaceId,
    navigate,
    onTagDelete,
    t,
    tag,
    tagColor,
    tagService.tagColors,
    tagValue,
  ]);

  return <Menu {...menuProps}>{children}</Menu>;
};

type TagOption = Tag | { readonly create: true; readonly value: string };
const isCreateNewTag = (
  tagOption: TagOption
): tagOption is { readonly create: true; readonly value: string } => {
  return 'create' in tagOption;
};

export const TagsEditor = ({ pageId, readonly }: TagsEditorProps) => {
  const t = useI18n();
  const tagService = useService(TagService);
  const tagList = tagService.tagList;
  const tags = useLiveData(tagList.tags$);
  const tagIds = useLiveData(tagList.tagIdsByPageId$(pageId));
  const [inputValue, setInputValue] = useState('');
  const filteredTags = useLiveData(
    inputValue ? tagList.filterTagsByName$(inputValue) : tagList.tags$
  );
  const [open, setOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const exactMatch = filteredTags.find(tag => tag.value$.value === inputValue);
  const showCreateTag = !exactMatch && inputValue.trim();

  // tag option candidates to show in the tag dropdown
  const tagOptions: TagOption[] = useMemo(() => {
    if (showCreateTag) {
      return [{ create: true, value: inputValue } as const, ...filteredTags];
    } else {
      return filteredTags;
    }
  }, [filteredTags, inputValue, showCreateTag]);

  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [focusedInlineIndex, setFocusedInlineIndex] = useState<number>(
    tagIds.length
  );

  // -1: no focus
  const safeFocusedIndex = clamp(focusedIndex, -1, tagOptions.length - 1);
  // inline tags focus index can go beyond the length of tagIds
  // using -1 and tagIds.length to make keyboard navigation easier
  const safeInlineFocusedIndex = clamp(focusedInlineIndex, -1, tagIds.length);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleCloseModal = useCallback(
    (open: boolean) => {
      setOpen(open);
      setSelectedTagIds([]);
    },
    [setOpen]
  );

  const onTagDelete = useCallback(
    (tagIds: string[]) => {
      setOpen(true);
      setSelectedTagIds(tagIds);
    },
    [setOpen, setSelectedTagIds]
  );

  const onInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const onToggleTag = useCallback(
    (id: string) => {
      const tagEntity = tagList.tags$.value.find(o => o.id === id);
      if (!tagEntity) {
        return;
      }
      if (!tagIds.includes(id)) {
        tagEntity.tag(pageId);
      } else {
        tagEntity.untag(pageId);
      }
    },
    [pageId, tagIds, tagList.tags$.value]
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const [nextColor, rotateNextColor] = useReducer(
    color => {
      const idx = tagService.tagColors.findIndex(c => c[1] === color);
      return tagService.tagColors[(idx + 1) % tagService.tagColors.length][1];
    },
    tagService.tagColors[
      Math.floor(Math.random() * tagService.tagColors.length)
    ][1]
  );

  const onCreateTag = useCallback(
    (name: string) => {
      rotateNextColor();
      const newTag = tagList.createTag(name.trim(), nextColor);
      return newTag.id;
    },
    [nextColor, tagList]
  );

  const onSelectTagOption = useCallback(
    (tagOption: TagOption) => {
      const id = isCreateNewTag(tagOption)
        ? onCreateTag(tagOption.value)
        : tagOption.id;
      onToggleTag(id);
      setInputValue('');
      focusInput();
      setFocusedIndex(-1);
      setFocusedInlineIndex(tagIds.length + 1);
    },
    [onCreateTag, onToggleTag, focusInput, tagIds.length]
  );
  const onEnter = useCallback(() => {
    if (safeFocusedIndex >= 0) {
      onSelectTagOption(tagOptions[safeFocusedIndex]);
    }
  }, [onSelectTagOption, safeFocusedIndex, tagOptions]);

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && inputValue === '' && tagIds.length) {
        const tagToRemove =
          safeInlineFocusedIndex < 0 || safeInlineFocusedIndex >= tagIds.length
            ? tagIds.length - 1
            : safeInlineFocusedIndex;
        tags.find(item => item.id === tagIds.at(tagToRemove))?.untag(pageId);
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
        setFocusedInlineIndex(tagIds.length + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
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
      tagIds,
      safeFocusedIndex,
      tagOptions,
      safeInlineFocusedIndex,
      tags,
      pageId,
    ]
  );

  return (
    <div data-testid="tags-editor-popup" className={styles.tagsEditorRoot}>
      <div className={styles.tagsEditorSelectedTags}>
        <InlineTagsList
          pageId={pageId}
          readonly={readonly}
          focusedIndex={safeInlineFocusedIndex}
          onRemove={focusInput}
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
        </InlineTagsList>
      </div>
      <div className={styles.tagsEditorTagsSelector}>
        <div className={styles.tagsEditorTagsSelectorHeader}>
          {t['com.affine.page-properties.tags.selector-header-title']()}
        </div>
        <Scrollable.Root>
          <Scrollable.Viewport
            ref={scrollContainerRef}
            className={styles.tagSelectorTagsScrollContainer}
          >
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
                    <TempTagItem value={inputValue} color={nextColor} />
                  </div>
                );
              } else {
                return (
                  <div
                    key={tag.id}
                    {...commonProps}
                    data-tag-id={tag.id}
                    data-tag-value={tag.value$.value}
                  >
                    <TagItem maxWidth="100%" tag={tag} mode="inline" />
                    <div className={styles.spacer} />
                    <EditTagMenu tagId={tag.id} onTagDelete={onTagDelete}>
                      <IconButton className={styles.tagEditIcon}>
                        <MoreHorizontalIcon />
                      </IconButton>
                    </EditTagMenu>
                  </div>
                );
              }
            })}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar style={{ transform: 'translateX(6px)' }} />
        </Scrollable.Root>
      </div>
      <DeleteTagConfirmModal
        open={open}
        onOpenChange={handleCloseModal}
        selectedTagIds={selectedTagIds}
      />
    </div>
  );
};

interface TagsInlineEditorProps extends TagsEditorProps {
  placeholder?: string;
  className?: string;
}

// this tags value renderer right now only renders the legacy tags for now
export const TagsInlineEditor = ({
  pageId,
  readonly,
  placeholder,
  className,
}: TagsInlineEditorProps) => {
  const tagList = useService(TagService).tagList;
  const tagIds = useLiveData(tagList.tagIdsByPageId$(pageId));
  const empty = !tagIds || tagIds.length === 0;
  return (
    <Menu
      contentOptions={{
        side: 'bottom',
        align: 'start',
        sideOffset: 0,
        avoidCollisions: false,
        className: styles.tagsMenu,
        onClick(e) {
          e.stopPropagation();
        },
      }}
      items={<TagsEditor pageId={pageId} readonly={readonly} />}
    >
      <div
        className={clsx(styles.tagsInlineEditor, className)}
        data-empty={empty}
        data-readonly={readonly}
      >
        {empty ? placeholder : <InlineTagsList pageId={pageId} readonly />}
      </div>
    </Menu>
  );
};
