import {
  Divider,
  Menu,
  MenuItem,
  type MenuProps,
  RowInput,
  Scrollable,
} from '@affine/component';
import { type Tag, TagService } from '@affine/core/modules/tag';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon, DoneIcon, SearchIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  forwardRef,
  type HTMLProps,
  useCallback,
  useRef,
  useState,
} from 'react';

import * as styles from './list-header.css';

export const TagListHeader = ({ tag }: { tag: Tag }) => {
  const t = useI18n();
  return (
    <header className={styles.header}>
      <div className={styles.breadcrumb}>
        <div className={styles.breadcrumbItem}>
          <WorkbenchLink to="/tag" className={styles.breadcrumbLink}>
            {t['Tags']()}
          </WorkbenchLink>
        </div>
        <div className={styles.breadcrumbSeparator}>/</div>
        <div className={styles.breadcrumbItem} data-active={true}>
          <TagSelector currentTag={tag} />
        </div>
      </div>

      <div className={styles.headerActions}></div>
    </header>
  );
};

const contentMenuOptions: MenuProps['contentOptions'] = {
  align: 'start',
  side: 'bottom',
  sideOffset: 4,
  className: styles.tagSelectorMenuRoot,
};
const TagSelector = ({ currentTag }: { currentTag: Tag }) => {
  const [isOpen, setIsOpen] = useState(false);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <Menu
      rootOptions={{
        open: isOpen,
        onOpenChange: setIsOpen,
      }}
      contentOptions={contentMenuOptions}
      items={<TagSelectorMenu currentTagId={currentTag.id} onClose={onClose} />}
    >
      <TagSelectorTrigger currentTag={currentTag} />
    </Menu>
  );
};

const TagSelectorTrigger = forwardRef<
  HTMLDivElement,
  HTMLProps<HTMLDivElement> & { currentTag: Tag }
>(function TagSelectorTrigger({ currentTag, className, ...props }, ref) {
  const tagColor = useLiveData(currentTag.color$);
  const tagName = useLiveData(currentTag.value$);

  return (
    <div
      className={clsx(styles.tagSelectorTrigger, className)}
      ref={ref}
      {...props}
    >
      <div
        className={styles.tagSelectorTriggerIcon}
        style={{ color: tagColor }}
      />
      <div className={styles.tagSelectorTriggerName}>{tagName}</div>
      <div className={styles.tagSelectorTriggerDropdown}>
        <ArrowDownSmallIcon />
      </div>
    </div>
  );
});

const TagSelectorMenu = ({
  currentTagId,
  onClose,
}: {
  currentTagId: string;
  onClose: () => void;
}) => {
  const t = useI18n();
  const [inputValue, setInputValue] = useState('');
  const tagList = useService(TagService).tagList;
  const filteredTags = useLiveData(
    inputValue ? tagList.filterTagsByName$(inputValue) : tagList.tags$
  );
  return (
    <>
      <header className={styles.tagSelectorMenuHeader}>
        <SearchIcon className={styles.tagSelectorMenuSearchIcon} />
        <RowInput
          value={inputValue}
          onChange={setInputValue}
          placeholder={t['Search tags']()}
        />
      </header>
      <Divider size="thinner" />
      <Scrollable.Root className={styles.tagSelectorMenuScrollArea}>
        <Scrollable.Viewport className={styles.tagSelectorMenuViewport}>
          {filteredTags.map(tag => {
            return (
              <TagLink
                key={tag.id}
                tag={tag}
                checked={tag.id === currentTagId}
                onClick={onClose}
              />
            );
          })}
          {filteredTags.length === 0 ? (
            <div className={styles.tagSelectorMenuEmpty}>
              {t['Find 0 result']()}
            </div>
          ) : null}
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </>
  );
};

const TagLink = ({
  tag,
  checked,
  onClick,
}: {
  tag: Tag;
  checked: boolean;
  onClick: () => void;
}) => {
  const tagColor = useLiveData(tag.color$);
  const tagTitle = useLiveData(tag.value$);
  const aRef = useRef<HTMLAnchorElement>(null);

  const onSelect = useCallback(() => {
    aRef.current?.click();
  }, []);

  return (
    <MenuItem onSelect={onSelect} className={styles.tagSelectorMenuItem}>
      <WorkbenchLink
        ref={aRef}
        key={tag.id}
        className={styles.tagSelectorItem}
        data-tag-id={tag.id}
        data-tag-value={tagTitle}
        to={`/tag/${tag.id}`}
        onClick={onClick}
      >
        <div
          className={styles.tagSelectorItemIcon}
          style={{ color: tagColor }}
        />
        <div className={styles.tagSelectorItemText}>{tagTitle}</div>
        {checked ? (
          <DoneIcon className={styles.tagSelectorItemCheckedIcon} />
        ) : null}
      </WorkbenchLink>
    </MenuItem>
  );
};
