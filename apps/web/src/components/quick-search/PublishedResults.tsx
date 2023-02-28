import { useTranslation } from '@affine/i18n';
import { EdgelessIcon, PaperIcon } from '@blocksuite/icons';
import { Workspace } from '@blocksuite/store';
import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

import usePageHelper from '@/hooks/use-page-helper';
import { PageMeta } from '@/providers/app-state-provider';
import { useGlobalState } from '@/store/app';

import { NoResultSVG } from './NoResultSVG';
import { StyledListItem, StyledNotFound } from './style';

export const PublishedResults = ({
  query,
  onClose,
  setPublishWorkspaceName,
}: {
  query: string;
  setPublishWorkspaceName: Dispatch<SetStateAction<string>>;
  onClose: () => void;
}) => {
  const [workspace, setWorkspace] = useState<Workspace>();
  const { search } = usePageHelper();
  const dataCenter = useGlobalState(store => store.dataCenter);
  const router = useRouter();
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  useEffect(() => {
    dataCenter
      .loadPublicWorkspace(router.query.workspaceId as string)
      .then(data => {
        setPageList(data.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]);
        if (data.blocksuiteWorkspace) {
          setWorkspace(data.blocksuiteWorkspace);
          setPublishWorkspaceName(data.blocksuiteWorkspace.meta.name);
        }
      })
      .catch(() => {
        router.push('/404');
      });
  }, [router, dataCenter, setPublishWorkspaceName]);
  const { t } = useTranslation();

  if (!query) {
    return <></>;
  }

  const results = search(query, workspace);
  const pageIds = [...results.values()];
  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1 && !page.trash
  );

  if (!resultsPageMeta.length) {
    return (
      <StyledNotFound>
        <span>{t('Find 0 result')}</span>
        <NoResultSVG />
      </StyledNotFound>
    );
  }

  return (
    <Command.Group
      heading={t('Find results', { number: resultsPageMeta.length })}
    >
      {resultsPageMeta.map(result => {
        return (
          <Command.Item
            key={result.id}
            onSelect={() => {
              router.push(
                `/public-workspace/${router.query.workspaceId}/${result.id}`
              );
              onClose();
            }}
            value={result.id}
          >
            <StyledListItem>
              {result.mode === 'edgeless' ? <EdgelessIcon /> : <PaperIcon />}
              <span>{result.title}</span>
            </StyledListItem>
          </Command.Item>
        );
      })}
    </Command.Group>
  );
};
