import {
  IconButton,
  Input,
  Menu,
  type MenuProps,
  Scrollable,
} from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { TagService } from '@affine/core/modules/tag';
import { WorkspaceLegacyProperties } from '@affine/core/modules/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, MoreHorizontalIcon, TagsIcon } from '@blocksuite/icons';
import { useLiveData } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { TagItem, TempTagItem } from '../../page-list';
import { tagColors } from './common';
import { type MenuItemOption, renderMenuItemOptions } from './menu-items';
import * as styles from './tags-inline-editor.css';

interface TagsEditorProps {
  pageId: string;
  readonly?: boolean;
}

interface InlineTagsListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>,
    Omit<TagsEditorProps, 'onOptionsChange'> {}

const InlineTagsList = ({
  pageId,
  readonly,
  children,
}: PropsWithChildren<InlineTagsListProps>) => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tags);
  const tagIds = useLiveData(tagService.tagIdsByPageId(pageId));

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
            };
        return (
          <TagItem
            key={tagId}
            idx={idx}
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
  children,
}: PropsWithChildren<{ tagId: string }>) => {
  const t = useAFFiNEI18N();
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const tagService = useService(TagService);
  const tag = useLiveData(tagService.tagByTagId(tagId));
  const tagColor = useLiveData(tag?.color);
  const tagValue = useLiveData(tag?.value);
  const navigate = useNavigateHelper();

  const menuProps = useMemo(() => {
    const options: MenuItemOption[] = [];
    const updateTagName = (name: string) => {
      if (name.trim() === '') {
        return;
      }
      tag?.rename(name);
    };
    options.push(
      <Input
        defaultValue={tagValue}
        onBlur={e => {
          updateTagName(e.currentTarget.value);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            e.preventDefault();
            updateTagName(e.currentTarget.value);
          }
        }}
        placeholder={t['Untitled']()}
      />
    );

    options.push('-');

    options.push({
      text: t['Delete'](),
      icon: <DeleteIcon />,
      type: 'danger',
      onClick() {
        tagService.deleteTag(tag?.id || '');
      },
    });

    options.push({
      text: t['com.affine.page-properties.tags.open-tags-page'](),
      icon: <TagsIcon />,
      onClick() {
        navigate.jumpToTag(legacyProperties.workspaceId, tag?.id || '');
      },
    });

    options.push('-');

    options.push(
      tagColors.map(([name, color]) => {
        return {
          text: name,
          icon: (
            <div className={styles.tagColorIconWrapper}>
              <div
                className={styles.tagColorIcon}
                style={{
                  backgroundColor: color,
                }}
              />
            </div>
          ),
          checked: tagColor === color,
          onClick() {
            tag?.changeColor(color);
          },
        };
      })
    );
    const items = renderMenuItemOptions(options);

    return {
      contentOptions: {
        onClick(e) {
          e.stopPropagation();
        },
      },
      items,
    } satisfies Partial<MenuProps>;
  }, [
    legacyProperties.workspaceId,
    navigate,
    t,
    tag,
    tagColor,
    tagService,
    tagValue,
  ]);

  return <Menu {...menuProps}>{children}</Menu>;
};

export const TagsEditor = ({ pageId, readonly }: TagsEditorProps) => {
  const t = useAFFiNEI18N();
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tags);
  const tagIds = useLiveData(tagService.tagIdsByPageId(pageId));
  const [inputValue, setInputValue] = useState('');

  const exactMatch = useLiveData(tagService.tagByTagValue(inputValue));

  const filteredLiveData = useMemo(() => {
    if (inputValue) {
      return tagService.filterTagsByName(inputValue);
    }
    return tagService.tags;
  }, [inputValue, tagService]);
  const filteredTags = useLiveData(filteredLiveData);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const onAddTag = useCallback(
    (id: string) => {
      if (!tagIds.includes(id)) {
        tags.find(o => o.id === id)?.tag(pageId);
      }
    },
    [pageId, tagIds, tags]
  );

  const [nextColor, rotateNextColor] = useReducer(
    color => {
      const idx = tagColors.findIndex(c => c[1] === color);
      return tagColors[(idx + 1) % tagColors.length][1];
    },
    tagColors[Math.floor(Math.random() * tagColors.length)][1]
  );

  const onCreateTag = useCallback(
    (name: string) => {
      if (!name.trim()) {
        return;
      }
      rotateNextColor();
      const newTag = tagService.createTag(name.trim(), nextColor);
      newTag.tag(pageId);
    },
    [nextColor, pageId, tagService]
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (exactMatch) {
          onAddTag(exactMatch.id);
        } else {
          onCreateTag(inputValue);
        }
        setInputValue('');
      } else if (e.key === 'Backspace' && inputValue === '' && tagIds.length) {
        const lastTagId = tagIds[tagIds.length - 1];
        tags.find(tag => tag.id === lastTagId)?.untag(pageId);
      }
    },
    [exactMatch, inputValue, onAddTag, onCreateTag, pageId, tagIds, tags]
  );

  return (
    <div data-testid="tags-editor-popup" className={styles.tagsEditorRoot}>
      <div className={styles.tagsEditorSelectedTags}>
        <InlineTagsList pageId={pageId} readonly={readonly}>
          <input
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={onInputKeyDown}
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
            className={styles.tagSelectorTagsScrollContainer}
          >
            {filteredTags.map(tag => {
              return (
                <div
                  key={tag.id}
                  className={styles.tagSelectorItem}
                  data-testid="tag-selector-item"
                  data-tag-id={tag.id}
                  data-tag-value={tag.value}
                  onClick={() => {
                    onAddTag(tag.id);
                  }}
                >
                  <TagItem maxWidth="100%" tag={tag} mode="inline" />
                  <div className={styles.spacer} />
                  <EditTagMenu tagId={tag.id}>
                    <IconButton
                      className={styles.tagEditIcon}
                      type="plain"
                      icon={<MoreHorizontalIcon />}
                    />
                  </EditTagMenu>
                </div>
              );
            })}
            {exactMatch || !inputValue ? null : (
              <div
                data-testid="tag-selector-item"
                className={styles.tagSelectorItem}
                onClick={() => {
                  setInputValue('');
                  onCreateTag(inputValue);
                }}
              >
                {t['Create']()}{' '}
                <TempTagItem value={inputValue} color={nextColor} />
              </div>
            )}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar style={{ transform: 'translateX(6px)' }} />
        </Scrollable.Root>
      </div>
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
  const tagService = useService(TagService);
  const tagIds = useLiveData(tagService.tagIdsByPageId(pageId));
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
