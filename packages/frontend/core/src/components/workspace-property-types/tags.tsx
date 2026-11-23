import { type MenuRef, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { type Tag, TagService } from '@affine/core/modules/tag';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { TagsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import type { PropertyValueProps } from '../properties/types';
import {
  WorkspaceTagsInlineEditor as TagsInlineEditorComponent,
  WorkspaceTagsInlineEditor,
} from '../tags';
import * as styles from './tags.css';

export const TagsValue = ({ readonly }: PropertyValueProps) => {
  const t = useI18n();

  const doc = useService(DocService).doc;

  const tagList = useService(TagService).tagList;
  const tagIds = useLiveData(tagList.tagIdsByPageId$(doc.id));
  const empty = !tagIds || tagIds.length === 0;

  return (
    <PropertyValue
      className={styles.container}
      isEmpty={empty}
      data-testid="property-tags-value"
      readonly={readonly}
    >
      <TagsInlineEditor
        className={styles.tagInlineEditor}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
        pageId={doc.id}
        onChange={() => {}}
        readonly={readonly}
      />
    </PropertyValue>
  );
};

export const TagsFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const tagService = useService(TagService);
  const allTagMetas = useLiveData(tagService.tagList.tagMetas$);
  const menuRef = useRef<MenuRef>(null);

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  const selectedTags = useMemo(
    () =>
      filter.value
        ?.split(',')
        .filter(id => allTagMetas.some(tag => tag.id === id)) ?? [],
    [filter, allTagMetas]
  );

  const handleSelectTag = useCallback(
    (tagId: string) => {
      onChange({
        ...filter,
        value: [...selectedTags, tagId].join(','),
      });
    },
    [filter, onChange, selectedTags]
  );

  const handleDeselectTag = useCallback(
    (tagId: string) => {
      onChange({
        ...filter,
        value: selectedTags.filter(id => id !== tagId).join(','),
      });
    },
    [filter, onChange, selectedTags]
  );

  useEffect(() => {
    if (
      isDraft &&
      (filter.method === 'is-not-empty' || filter.method === 'is-empty')
    ) {
      onDraftCompleted?.();
    }
  }, [isDraft, filter.method, onDraftCompleted]);

  return filter.method !== 'is-not-empty' && filter.method !== 'is-empty' ? (
    <WorkspaceTagsInlineEditor
      placeholder={
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      }
      selectedTags={selectedTags}
      onSelectTag={handleSelectTag}
      onDeselectTag={handleDeselectTag}
      menuClassName={styles.filterValueMenu}
      tagMode="inline-tag"
      ref={menuRef}
      onEditorClose={onDraftCompleted}
    />
  ) : undefined;
};

const TagsInlineEditor = ({
  pageId,
  readonly,
  placeholder,
  className,
  onChange,
}: {
  placeholder?: string;
  className?: string;
  onChange?: (value: unknown) => void;
  pageId: string;
  readonly?: boolean;
  focusedIndex?: number;
}) => {
  const workspace = useService(WorkspaceService);
  const tagService = useService(TagService);
  const tagIds$ = tagService.tagList.tagIdsByPageId$(pageId);
  const tagIds = useLiveData(tagIds$);

  const onSelectTag = useCallback(
    (tagId: string) => {
      tagService.tagList.tagByTagId$(tagId).value?.tag(pageId);
      onChange?.(tagIds$.value);
    },
    [onChange, pageId, tagIds$, tagService.tagList]
  );

  const onDeselectTag = useCallback(
    (tagId: string) => {
      tagService.tagList.tagByTagId$(tagId).value?.untag(pageId);
      onChange?.(tagIds$.value);
    },
    [onChange, pageId, tagIds$, tagService.tagList]
  );

  const navigator = useNavigateHelper();

  const jumpToTag = useCallback(
    (id: string) => {
      navigator.jumpToTag(workspace.workspace.id, id);
    },
    [navigator, workspace.workspace.id]
  );

  const t = useI18n();

  return (
    <TagsInlineEditorComponent
      tagMode="inline-tag"
      jumpToTag={jumpToTag}
      readonly={readonly}
      placeholder={placeholder}
      className={className}
      selectedTags={tagIds}
      onSelectTag={onSelectTag}
      onDeselectTag={onDeselectTag}
      title={
        <>
          <TagsIcon />
          {t['Tags']()}
        </>
      }
    />
  );
};

const TagName = ({ tag }: { tag: Tag }) => {
  const name = useLiveData(tag.value$);
  return name;
};
const TagIcon = ({ tag, size = 8 }: { tag: Tag; size?: number }) => {
  const color = useLiveData(tag.color$);
  return (
    <div
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        borderRadius: '50%',
      }}
    />
  );
};

export const TagsDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const max = 3;
  const t = useI18n();
  const tagList = useService(TagService).tagList;
  const tags = useLiveData(tagList.tagsByPageId$(doc.id));

  const showRest = tags.length > max + 1;
  const visibleTags = tags.length === max + 1 ? max + 1 : max;

  return (
    <>
      {tags.slice(0, visibleTags).map(tag => {
        return (
          <StackProperty icon={<TagIcon tag={tag} />} key={tag.id}>
            <TagName tag={tag} />
          </StackProperty>
        );
      })}
      {showRest ? (
        <StackProperty icon={null}>
          <span>+{tags.length - max}</span>
          <span className={styles.moreTagsLabel}>{t['Tags']()}</span>
        </StackProperty>
      ) : null}
    </>
  );
};

export const TagsGroupHeader = ({ groupId, docCount }: GroupHeaderProps) => {
  const t = useI18n();
  const tagService = useService(TagService);
  const tag = useLiveData(tagService.tagList.tagByTagId$(groupId));

  if (!tag) {
    return (
      <PlainTextDocGroupHeader
        groupId={groupId}
        docCount={docCount}
        icon={
          <div
            style={{
              backgroundColor: cssVarV2.icon.secondary,
              width: 8,
              height: 8,
              borderRadius: '50%',
            }}
          />
        }
      >
        {t['com.affine.page.display.grouping.group-by-tag.untagged']()}
      </PlainTextDocGroupHeader>
    );
  }
  return (
    <PlainTextDocGroupHeader
      groupId={groupId}
      docCount={docCount}
      icon={<TagIcon tag={tag} />}
    >
      <TagName tag={tag} />
    </PlainTextDocGroupHeader>
  );
};
