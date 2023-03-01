import { useTranslation } from '@affine/i18n';
import { EdgelessIcon, PaperIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import React, { useEffect, useMemo, useState } from 'react';

import { usePageMeta } from '../../../hooks/use-page-meta';
import { BlockSuiteWorkspace } from '../../../shared';
import { NoResultSVG } from './NoResultSVG';
import { StyledListItem, StyledNotFound } from './style';

export type PublishedResultsProps = {
  query: string;
  loading: boolean;
  setPublishWorkspaceName: (name: string) => void;
  onClose: () => void;
  blockSuiteWorkspace: BlockSuiteWorkspace;
};

export const PublishedResults: React.FC<PublishedResultsProps> = ({
  query,
  loading,
  onClose,
  setPublishWorkspaceName,
  blockSuiteWorkspace,
}) => {
  const [results, setResults] = useState(new Map<string, string | undefined>());
  const router = useRouter();
  const pageList = usePageMeta(blockSuiteWorkspace);
  // useEffect(() => {
  //   dataCenter
  //     .loadPublicWorkspace(router.query.workspaceId as string)
  //     .then(data => {
  //       setPageList(data.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]);
  //       if (data.blocksuiteWorkspace) {
  //         setWorkspace(data.blocksuiteWorkspace);
  //         setPublishWorkspaceName(data.blocksuiteWorkspace.meta.name);
  //       }
  //     })
  //     .catch(() => {
  //       router.push('/404');
  //     });
  // }, [router, dataCenter, setPublishWorkspaceName]);
  const { t } = useTranslation();
  useEffect(() => {
    setResults(blockSuiteWorkspace.search(query));
    //Save the Map<BlockId, PageId> obtained from the search as state
  }, [blockSuiteWorkspace, query, setResults]);
  const pageIds = useMemo(() => [...results.values()], [results]);
  const resultsPageMeta = useMemo(
    () => pageList.filter(page => pageIds.indexOf(page.id) > -1 && !page.trash),
    [pageIds, pageList]
  );

  return loading ? null : (
    <>
      {query ? (
        resultsPageMeta.length ? (
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
                    {result.mode === 'edgeless' ? (
                      <EdgelessIcon />
                    ) : (
                      <PaperIcon />
                    )}
                    <span>{result.title}</span>
                  </StyledListItem>
                </Command.Item>
              );
            })}
          </Command.Group>
        ) : (
          <StyledNotFound>
            <span>{t('Find 0 result')}</span>
            <NoResultSVG />
          </StyledNotFound>
        )
      ) : (
        <></>
      )}
    </>
  );
};
