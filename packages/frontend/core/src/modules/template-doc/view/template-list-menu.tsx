import {
  IconButton,
  Menu,
  MenuItem,
  type MenuProps,
  Scrollable,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { inferOpenMode } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import {
  DualLinkIcon,
  InformationIcon,
  TemplateIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { type DocRecord, DocsService } from '../../doc';
import { DocDisplayMetaService } from '../../doc-display-meta';
import { WorkbenchLink, WorkbenchService } from '../../workbench';
import { TemplateDocService } from '../services/template-doc';
import * as styles from './styles.css';
interface CommonProps {
  onSelect?: (docId: string) => void;
  asLink?: boolean;
}

interface DocItemProps extends CommonProps {
  doc: DocRecord;
}

const DocItem = ({ doc, onSelect, asLink }: DocItemProps) => {
  const docDisplayService = useService(DocDisplayMetaService);
  const Icon = useLiveData(docDisplayService.icon$(doc.id));
  const title = useLiveData(docDisplayService.title$(doc.id));

  const onClick = useAsyncCallback(async () => {
    onSelect?.(doc.id);
  }, [doc.id, onSelect]);

  const menuItem = (
    <MenuItem
      prefixIcon={<Icon />}
      onClick={onClick}
      data-testid={`template-doc-item-${doc.id}`}
    >
      {title}
    </MenuItem>
  );

  if (asLink) {
    return <WorkbenchLink to={`/${doc.id}`}>{menuItem}</WorkbenchLink>;
  }
  return menuItem;
};

const Empty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>
      <InformationIcon className={styles.emptyIcon} />
      <span className={styles.emptyText}>
        {t['com.affine.template-list.empty']()}
      </span>
      <div className={styles.space} />
      <a
        href="https://affine.pro/blog/how-to-use-template"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        <IconButton icon={<DualLinkIcon />} />
      </a>
    </div>
  );
};

interface TemplateListMenuContentProps extends CommonProps {
  prefixItems?: React.ReactNode;
  suffixItems?: React.ReactNode;
}
export const TemplateListMenuContent = ({
  prefixItems,
  suffixItems,
  ...props
}: TemplateListMenuContentProps) => {
  const templateDocService = useService(TemplateDocService);
  const [templateDocs] = useState(() =>
    templateDocService.list.getTemplateDocs()
  );

  return (
    <ul className={styles.list}>
      {prefixItems}
      {templateDocs.length ? (
        templateDocs.map(doc => <DocItem key={doc.id} doc={doc} {...props} />)
      ) : (
        <Empty />
      )}
      {suffixItems}
    </ul>
  );
};

export const TemplateListMenuContentScrollable = (
  props: TemplateListMenuContentProps
) => {
  return (
    <Scrollable.Root>
      <Scrollable.Scrollbar />
      <Scrollable.Viewport className={styles.scrollableViewport}>
        <TemplateListMenuContent {...props} />
      </Scrollable.Viewport>
    </Scrollable.Root>
  );
};

interface TemplateListMenuProps
  extends TemplateListMenuContentProps, Omit<MenuProps, 'items'> {}
export const TemplateListMenu = ({
  children,
  onSelect,
  asLink,
  prefixItems,
  suffixItems,
  contentOptions,
  ...otherProps
}: TemplateListMenuProps) => {
  return (
    <Menu
      items={
        <TemplateListMenuContentScrollable
          onSelect={onSelect}
          asLink={asLink}
          prefixItems={prefixItems}
          suffixItems={suffixItems}
        />
      }
      contentOptions={{
        ...contentOptions,
        className: styles.menuContent,
      }}
      {...otherProps}
    >
      {children}
    </Menu>
  );
};

export const TemplateListMenuAdd = () => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const workbench = useService(WorkbenchService).workbench;

  const createNewTemplate = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const record = docsService.createDoc({ isTemplate: true });
      workbench.openDoc(record.id, { at: inferOpenMode(e) });
    },
    [docsService, workbench]
  );

  return (
    <MenuItem
      data-testid="template-doc-item-create"
      prefixIcon={<TemplateIcon />}
      onClick={createNewTemplate}
      onAuxClick={createNewTemplate}
    >
      {t['com.affine.template-list.create-new']()}
    </MenuItem>
  );
};
