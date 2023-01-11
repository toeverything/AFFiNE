import { Command } from 'cmdk';
import { StyledListItem, StyledNotFound } from './style';
import { useModal } from '@/providers/GlobalModalProvider';
import { PaperIcon, EdgelessIcon } from '@blocksuite/icons';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import { useSwitchToConfig } from './config';
import { NoResultSVG } from './NoResultSVG';
import { useTranslation } from '@affine/i18n';
import usePageHelper from '@/hooks/use-page-helper';
export const Results = (props: {
  query: string;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setShowCreatePage: Dispatch<SetStateAction<boolean>>;
}) => {
  const query = props.query;
  const loading = props.loading;
  const setLoading = props.setLoading;
  const setShowCreatePage = props.setShowCreatePage;
  const { triggerQuickSearchModal } = useModal();
  const { openPage } = usePageHelper();
  const router = useRouter();
  const { currentWorkspaceId, pageList } = useAppState();
  const { search } = usePageHelper();
  const List = useSwitchToConfig(currentWorkspaceId);
  const [results, setResults] = useState(new Map<string, string | undefined>());
  const { t } = useTranslation();
  useEffect(() => {
    setResults(search(query));
    setLoading(false);
    //Save the Map<BlockId, PageId> obtained from the search as state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, setResults, setLoading]);
  const pageIds = [...results.values()];

  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1 && !page.trash
  );

  useEffect(() => {
    setShowCreatePage(!resultsPageMeta.length);
    //Determine whether to display the  ‘+ New page’
  }, [resultsPageMeta, setShowCreatePage]);
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
                    openPage(result.id);
                    triggerQuickSearchModal();
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
        <Command.Group heading={t('Switch to')}>
          {List.map(link => {
            return (
              <Command.Item
                key={link.title}
                value={link.title}
                onSelect={() => {
                  router.push(link.href);
                  triggerQuickSearchModal();
                }}
              >
                <StyledListItem>
                  <link.icon />
                  <span>{link.title}</span>
                </StyledListItem>
              </Command.Item>
            );
          })}
        </Command.Group>
      )}
    </>
  );
};
