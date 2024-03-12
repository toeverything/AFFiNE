import {
  IconButton,
  Input,
  Menu,
  type MenuProps,
  Scrollable,
} from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { WorkspaceLegacyProperties } from '@affine/core/modules/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, MoreHorizontalIcon, TagsIcon } from '@blocksuite/icons';
import type { Tag } from '@blocksuite/store';
import { useService } from '@toeverything/infra/di';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import {
  type HTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { TagItem } from '../../page-list';
import { tagColors } from './common';
import { type MenuItemOption, renderMenuItemOptions } from './menu-items';
import * as styles from './tags-inline-editor.css';

interface TagsEditorProps {
  value: string[]; // selected tag ids
  onChange?: (value: string[]) => void;
  options: Tag[];
  onOptionsChange?: (options: Tag[]) => void; // adding/updating/removing tags
  readonly?: boolean;
}

interface InlineTagsListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>,
    Omit<TagsEditorProps, 'onOptionsChange'> {}

const InlineTagsList = ({
  value,
  onChange,
  options,
  readonly,
  children,
}: PropsWithChildren<InlineTagsListProps>) => {
  return (
    <div className={styles.inlineTagsContainer} data-testid="inline-tags-list">
      {value.map((tagId, idx) => {
        const tag = options.find(t => t.id === tagId);
        if (!tag) {
          return null;
        }
        const onRemoved =
          readonly || !onChange
            ? undefined
            : () => {
                onChange(value.filter(v => v !== tagId));
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

const filterOption = (option: Tag, inputValue?: string) => {
  const trimmedValue = inputValue?.trim().toLowerCase() ?? '';
  const trimmedOptionValue = option.value.trim().toLowerCase();
  return trimmedOptionValue.includes(trimmedValue);
};

export const EditTagMenu = ({
  tag,
  children,
}: PropsWithChildren<{ tag: Tag }>) => {
  const t = useAFFiNEI18N();
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const navigate = useNavigateHelper();

  const menuProps = useMemo(() => {
    const options: MenuItemOption[] = [];
    const updateTagName = (name: string) => {
      if (name.trim() === '') {
        return;
      }
      legacyProperties.updateTagOption(tag.id, {
        ...tag,
        value: name,
      });
    };
    options.push(
      <Input
        defaultValue={tag.value}
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
        legacyProperties.removeTagOption(tag.id);
      },
    });

    options.push({
      text: t['com.affine.page-properties.tags.open-tags-page'](),
      icon: <TagsIcon />,
      onClick() {
        navigate.jumpToTag(legacyProperties.workspaceId, tag.id);
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
          checked: tag.color === color,
          onClick() {
            legacyProperties.updateTagOption(tag.id, {
              ...tag,
              color,
            });
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
  }, [legacyProperties, navigate, t, tag]);

  return <Menu {...menuProps}>{children}</Menu>;
};

export const TagsEditor = ({
  options,
  value,
  onChange,
  onOptionsChange,
  readonly,
}: TagsEditorProps) => {
  const t = useAFFiNEI18N();
  const [inputValue, setInputValue] = useState('');
  const exactMatch = options.find(o => o.value === inputValue);
  const filteredOptions = useMemo(
    () =>
      options.filter(o => (inputValue ? filterOption(o, inputValue) : true)),
    [inputValue, options]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const onAddTag = useCallback(
    (id: string) => {
      if (!value.includes(id)) {
        onChange?.([...value, id]);
      }
    },
    [onChange, value]
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

      const newTag = {
        id: nanoid(),
        value: name.trim(),
        color: nextColor,
      };
      rotateNextColor();
      onOptionsChange?.([...options, newTag]);
      onChange?.([...value, newTag.id]);
    },
    [nextColor, onChange, onOptionsChange, options, value]
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
      } else if (e.key === 'Backspace' && inputValue === '' && value.length) {
        onChange?.(value.slice(0, value.length - 1));
      }
    },
    [exactMatch, inputValue, onAddTag, onChange, onCreateTag, value]
  );

  return (
    <div data-testid="tags-editor-popup" className={styles.tagsEditorRoot}>
      <div className={styles.tagsEditorSelectedTags}>
        <InlineTagsList
          options={options}
          value={value}
          onChange={onChange}
          readonly={readonly}
        >
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
            {filteredOptions.map(tag => {
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
                  <EditTagMenu tag={tag}>
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
                <TagItem
                  maxWidth="100%"
                  tag={{
                    id: inputValue,
                    value: inputValue,
                    color: nextColor,
                  }}
                  mode="inline"
                />
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
  value,
  onChange,
  options,
  onOptionsChange,
  readonly,
  placeholder,
  className,
}: TagsInlineEditorProps) => {
  const empty = !value || value.length === 0;
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
      items={
        <TagsEditor
          value={value}
          options={options}
          onChange={onChange}
          onOptionsChange={onOptionsChange}
          readonly={readonly}
        />
      }
    >
      <div
        className={clsx(styles.tagsInlineEditor, className)}
        data-empty={empty}
        data-readonly={readonly}
      >
        {empty ? (
          placeholder
        ) : (
          <InlineTagsList
            value={value}
            onChange={onChange}
            options={options}
            readonly
          />
        )}
      </div>
    </Menu>
  );
};
