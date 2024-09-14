import { Avatar, Checkbox, DatePicker, Menu } from '@affine/component';
import { CloudDocMetaService } from '@affine/core/modules/cloud/services/cloud-doc-meta';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/properties/services/schema';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { i18nTime, useI18n } from '@affine/i18n';
import {
  DocService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { noop } from 'lodash-es';
import type { ChangeEventHandler } from 'react';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { managerContext } from './common';
import * as styles from './styles.css';
import { TagsInlineEditor } from './tags-inline-editor';

interface PropertyRowValueProps {
  property: PageInfoCustomProperty;
  meta: PageInfoCustomPropertyMeta;
}

export const DateValue = ({ property }: PropertyRowValueProps) => {
  const displayValue = property.value
    ? i18nTime(property.value, { absolute: { accuracy: 'day' } })
    : undefined;
  const manager = useContext(managerContext);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // show edit popup
  }, []);

  const handleChange = useCallback(
    (e: string) => {
      manager.updateCustomProperty(property.id, {
        value: e,
      });
    },
    [manager, property.id]
  );

  const t = useI18n();

  return (
    <Menu items={<DatePicker value={property.value} onChange={handleChange} />}>
      <div
        onClick={handleClick}
        className={styles.propertyRowValueCell}
        data-empty={!property.value}
      >
        {displayValue ??
          t['com.affine.page-properties.property-value-placeholder']()}
      </div>
    </Menu>
  );
};

export const CheckboxValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      manager.updateCustomProperty(property.id, {
        value: !property.value,
      });
    },
    [manager, property.id, property.value]
  );
  return (
    <div
      onClick={handleClick}
      className={styles.propertyRowValueCell}
      data-empty={!property.value}
    >
      <Checkbox
        className={styles.checkboxProperty}
        checked={!!property.value}
        onChange={noop}
      />
    </div>
  );
};

export const TextValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const [value, setValue] = useState<string>(property.value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      manager.updateCustomProperty(property.id, {
        value: (e.currentTarget as HTMLTextAreaElement).value.trim(),
      });
    },
    [manager, property.id]
  );
  // use native blur event to get event after unmount
  // don't use useLayoutEffect here, cause the cleanup function will be called before unmount
  useEffect(() => {
    ref.current?.addEventListener('blur', handleBlur);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ref.current?.removeEventListener('blur', handleBlur);
    };
  }, [handleBlur]);
  const handleOnChange: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    e => {
      setValue(e.target.value);
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setValue(property.value);
  }, [property.value]);

  return (
    <div onClick={handleClick} className={styles.propertyRowValueTextCell}>
      <textarea
        ref={ref}
        className={styles.propertyRowValueTextarea}
        value={value || ''}
        onChange={handleOnChange}
        onClick={handleClick}
        data-empty={!value}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
      />
      <div className={styles.propertyRowValueTextareaInvisible}>
        {value}
        {value?.endsWith('\n') || !value ? <br /> : null}
      </div>
    </div>
  );
};

export const NumberValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const [value, setValue] = useState(property.value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const handleBlur = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      manager.updateCustomProperty(property.id, {
        value: e.target.value.trim(),
      });
    },
    [manager, property.id]
  );
  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      setValue(e.target.value);
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setValue(property.value);
  }, [property.value]);
  return (
    <input
      className={styles.propertyRowValueNumberCell}
      type={'number'}
      value={value || ''}
      onChange={handleOnChange}
      onClick={handleClick}
      onBlur={handleBlur}
      data-empty={!value}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
    />
  );
};

export const TagsValue = () => {
  const doc = useService(DocService).doc;

  const t = useI18n();

  return (
    <TagsInlineEditor
      className={styles.propertyRowValueCell}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
      pageId={doc.id}
      readonly={doc.blockSuiteDoc.readonly}
    />
  );
};

const CloudUserAvatar = (props: { type: 'CreatedBy' | 'UpdatedBy' }) => {
  const cloudDocMetaService = useService(CloudDocMetaService);
  const cloudDocMeta = useLiveData(cloudDocMetaService.cloudDocMeta.meta$);
  const isRevalidating = useLiveData(
    cloudDocMetaService.cloudDocMeta.isRevalidating$
  );
  const error = useLiveData(cloudDocMetaService.cloudDocMeta.error$);

  useEffect(() => {
    cloudDocMetaService.cloudDocMeta.revalidate();
  }, [cloudDocMetaService]);

  const user = useMemo(() => {
    if (!cloudDocMeta) return null;
    if (props.type === 'CreatedBy' && cloudDocMeta.createdBy) {
      return {
        name: cloudDocMeta.createdBy.name,
        avatarUrl: cloudDocMeta.createdBy.avatarUrl,
      };
    } else if (props.type === 'UpdatedBy' && cloudDocMeta.updatedBy) {
      return {
        name: cloudDocMeta.updatedBy.name,
        avatarUrl: cloudDocMeta.updatedBy.avatarUrl,
      };
    }
    return null;
  }, [cloudDocMeta, props.type]);

  if (!cloudDocMeta) {
    if (isRevalidating) {
      // TODO: loading ui
      return null;
    }
    if (error) {
      // error ui
      return;
    }
    return null;
  }
  if (user) {
    return (
      <>
        <Avatar url={user.avatarUrl || ''} name={user.name} size={20} />
        <span>{user.name}</span>
      </>
    );
  }
  return <NoRecordValue />;
};

const NoRecordValue = () => {
  const t = useI18n();
  return (
    <span>
      {t['com.affine.page-properties.property-user-avatar-no-record']()}
    </span>
  );
};

const LocalUserValue = () => {
  const t = useI18n();
  return <span>{t['com.affine.page-properties.local-user']()}</span>;
};

export const CreatedUserValue = () => {
  const workspaceService = useService(WorkspaceService);
  const isCloud =
    workspaceService.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  if (!isCloud) {
    return (
      <div className={styles.propertyRowValueUserCell}>
        <LocalUserValue />
      </div>
    );
  }

  return (
    <div className={styles.propertyRowValueUserCell}>
      <CloudUserAvatar type="CreatedBy" />
    </div>
  );
};

export const UpdatedUserValue = () => {
  const workspaceService = useService(WorkspaceService);
  const isCloud =
    workspaceService.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  if (!isCloud) {
    return <LocalUserValue />;
  }

  return (
    <div className={styles.propertyRowValueUserCell}>
      <CloudUserAvatar type="UpdatedBy" />
    </div>
  );
};

export const propertyValueRenderers: Record<
  PagePropertyType,
  typeof DateValue
> = {
  date: DateValue,
  checkbox: CheckboxValue,
  text: TextValue,
  number: NumberValue,
  createdBy: CreatedUserValue,
  updatedBy: UpdatedUserValue,
  // TODO(@Peng): fix following
  tags: TagsValue,
  progress: TextValue,
};
