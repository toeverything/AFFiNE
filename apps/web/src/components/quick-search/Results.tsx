import { Command } from 'cmdk';
import { StyledListItem, StyledNotFound } from './style';
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
  onClose: () => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setShowCreatePage: Dispatch<SetStateAction<boolean>>;
}) => {
  const { query, loading, setLoading, setShowCreatePage, onClose } = props;
  const { openPage } = usePageHelper();
  const router = useRouter();
  const { currentWorkspace, pageList } = useAppState();
  const { search } = usePageHelper();
  const List = useSwitchToConfig(currentWorkspace?.id);
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
                    onClose();
                    openPage(result.id);
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
        <Command.Group heading={t('Jump to')}>
          {List.map(link => {
            return (
              <Command.Item
                key={link.title}
                value={link.title}
                onSelect={() => {
                  onClose();
                  router.push(link.href);
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
