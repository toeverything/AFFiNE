import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { ArrowDownBigIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';
import { Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

import * as styles from './error.css';
import { download } from './utils';

// https://github.com/toeverything/blocksuite/blob/master/packages/affine/components/src/icons/file-icons.ts
// TODO: should move file icons to icons repo
const FileIcon = () => (
  <svg
    width="96"
    height="96"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6.80781 1.875L10.8332 1.875C10.9989 1.875 11.1579 1.94085 11.2751 2.05806L16.2751 7.05806C16.3923 7.17527 16.4582 7.33424 16.4582 7.5V14.8587C16.4582 15.3038 16.4582 15.6754 16.4334 15.9789C16.4075 16.2955 16.3516 16.5927 16.2084 16.8737C15.9887 17.3049 15.6381 17.6555 15.2069 17.8752C14.9258 18.0184 14.6286 18.0744 14.3121 18.1002C14.0085 18.125 13.637 18.125 13.1919 18.125H6.80779C6.36267 18.125 5.99114 18.125 5.68761 18.1002C5.37104 18.0744 5.07383 18.0184 4.79278 17.8752C4.36157 17.6555 4.01099 17.3049 3.79128 16.8737C3.64808 16.5927 3.59215 16.2955 3.56629 15.9789C3.54149 15.6754 3.5415 15.3038 3.5415 14.8587V5.1413C3.5415 4.69618 3.54149 4.32464 3.56629 4.02111C3.59215 3.70454 3.64808 3.40732 3.79128 3.12627C4.01099 2.69507 4.36157 2.34449 4.79278 2.12478C5.07383 1.98157 5.37104 1.92565 5.68761 1.89978C5.99114 1.87498 6.36268 1.87499 6.80781 1.875ZM5.7894 3.14563C5.55013 3.16518 5.43573 3.20008 5.36026 3.23854C5.16426 3.3384 5.00491 3.49776 4.90504 3.69376C4.86659 3.76923 4.83168 3.88363 4.81214 4.1229C4.79199 4.36946 4.7915 4.68964 4.7915 5.16667V14.8333C4.7915 15.3104 4.79199 15.6305 4.81214 15.8771C4.83168 16.1164 4.86659 16.2308 4.90504 16.3062C5.00491 16.5022 5.16426 16.6616 5.36026 16.7615C5.43573 16.7999 5.55013 16.8348 5.7894 16.8544C6.03597 16.8745 6.35615 16.875 6.83317 16.875H13.1665C13.6435 16.875 13.9637 16.8745 14.2103 16.8544C14.4495 16.8348 14.5639 16.7999 14.6394 16.7615C14.8354 16.6616 14.9948 16.5022 15.0946 16.3062C15.1331 16.2308 15.168 16.1164 15.1875 15.8771C15.2077 15.6305 15.2082 15.3104 15.2082 14.8333V8.125H11.6665C10.8611 8.125 10.2082 7.47208 10.2082 6.66667V3.125H6.83317C6.35615 3.125 6.03597 3.12549 5.7894 3.14563ZM11.4582 4.00888L14.3243 6.875H11.6665C11.5514 6.875 11.4582 6.78173 11.4582 6.66667V4.00888Z"
      fill="#77757D"
    />
  </svg>
);

const PDFFileIcon = () => (
  <svg
    width="96"
    height="96"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7.75 4C7.75 2.20508 9.20508 0.75 11 0.75H27C27.1212 0.75 27.2375 0.798159 27.3232 0.883885L38.1161 11.6768C38.2018 11.7625 38.25 11.8788 38.25 12V36C38.25 37.7949 36.7949 39.25 35 39.25H11C9.20507 39.25 7.75 37.7949 7.75 36V4Z"
      fill="white"
      stroke="#D0D5DD"
      strokeWidth="1.5"
    />
    <path
      d="M27 0.5V8C27 10.2091 28.7909 12 31 12H38.5"
      stroke="#D0D5DD"
      strokeWidth="1.5"
    />
    <rect x="1" y="18" width="26" height="16" rx="2" fill="#D92D20" />
    <path
      d="M4.8323 30V22.7273H7.70162C8.25323 22.7273 8.72316 22.8326 9.11142 23.0433C9.49967 23.2517 9.7956 23.5417 9.9992 23.9134C10.2052 24.2827 10.3082 24.7088 10.3082 25.1918C10.3082 25.6747 10.204 26.1009 9.99565 26.4702C9.78732 26.8395 9.48547 27.1271 9.09011 27.3331C8.69712 27.5391 8.22127 27.642 7.66255 27.642H5.83372V26.4098H7.41397C7.7099 26.4098 7.95375 26.3589 8.14551 26.2571C8.33964 26.1529 8.48405 26.0097 8.57875 25.8274C8.67581 25.6428 8.72434 25.4309 8.72434 25.1918C8.72434 24.9503 8.67581 24.7396 8.57875 24.5597C8.48405 24.3774 8.33964 24.2365 8.14551 24.1371C7.95138 24.0353 7.70517 23.9844 7.40687 23.9844H6.36994V30H4.8323ZM13.885 30H11.3069V22.7273H13.9063C14.6379 22.7273 15.2676 22.8729 15.7955 23.1641C16.3235 23.4529 16.7295 23.8684 17.0136 24.4105C17.3 24.9527 17.4433 25.6013 17.4433 26.3565C17.4433 27.1141 17.3 27.7652 17.0136 28.3097C16.7295 28.8542 16.3211 29.272 15.7884 29.5632C15.2581 29.8544 14.6237 30 13.885 30ZM12.8445 28.6825H13.8211C14.2757 28.6825 14.658 28.602 14.9681 28.4411C15.2806 28.2777 15.515 28.0256 15.6713 27.6847C15.8299 27.3414 15.9092 26.8987 15.9092 26.3565C15.9092 25.8191 15.8299 25.38 15.6713 25.0391C15.515 24.6982 15.2818 24.4472 14.9717 24.2862C14.6615 24.1252 14.2792 24.0447 13.8247 24.0447H12.8445V28.6825ZM18.5823 30V22.7273H23.3976V23.995H20.1199V25.728H23.078V26.9957H20.1199V30H18.5823Z"
      fill="white"
    />
  </svg>
);

const FILE_ICONS: Record<string, () => ReactElement> = {
  'application/pdf': PDFFileIcon,
};

interface ErrorBaseProps {
  title: string;
  subtitle?: string;
  icon?: ReactElement;
  buttons?: ReactElement[];
}

const ErrorBase = ({
  title,
  subtitle,
  icon = <FileIcon />,
  buttons = [],
}: ErrorBaseProps) => {
  return (
    <div className={clsx([styles.viewer, styles.error])}>
      {icon}
      <h3 className={styles.errorTitle}>{title}</h3>
      <p className={styles.errorMessage}>{subtitle}</p>
      <div className={styles.errorBtns}>{buttons}</div>
    </div>
  );
};

interface ErrorProps {
  model: AttachmentBlockModel;
  ext: string;
}

export const AttachmentFallback = ({ model, ext }: ErrorProps) => {
  const t = useI18n();
  const Icon = FILE_ICONS[model.props.type] ?? FileIcon;
  const title = t['com.affine.attachment.preview.error.title']();
  const subtitle = `.${ext} ${t['com.affine.attachment.preview.error.subtitle']()}`;

  return (
    <ErrorBase
      icon={<Icon />}
      title={title}
      subtitle={subtitle}
      buttons={[
        <Button
          key="download"
          variant="primary"
          prefix={<ArrowDownBigIcon />}
          onClick={() => {
            download(model).catch(console.error);
          }}
        >
          Download
        </Button>,
      ]}
    />
  );
};

const ErrorBoundaryInner = (props: FallbackProps): ReactElement => {
  const t = useI18n();
  const title = t['com.affine.attachment.preview.error.title']();
  const subtitle = `${props.error}`;
  return <ErrorBase title={title} subtitle={subtitle} />;
};

export const AttachmentPreviewErrorBoundary = (props: PropsWithChildren) => {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryInner}>
      <Suspense>{props.children}</Suspense>
    </ErrorBoundary>
  );
};
