import { Command } from 'cmdk';
import { StyledListItem, StyledNotFound } from './style';
import { useModal } from '@/providers/global-modal-provider';
import { PaperIcon, EdgelessIcon } from '@blocksuite/icons';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider/context';
import { useRouter } from 'next/router';
import { config } from './config';
import { useGoToPage } from '@/providers/app-state-provider/hooks';
import { usePageList } from '@/providers/app-state-provider/usePageList';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
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
  const workspace = useLoadWorkspace();
  const pageList = usePageList(workspace);
  const goToPage = useGoToPage();
  const router = useRouter();
  const { search, currentWorkspaceId } = useAppState();
  const List = config(currentWorkspaceId);
  const [results, setResults] = useState(new Map<string, string | undefined>());
  useEffect(() => {
    setResults(search(query));
    setLoading(false);
    //Save the Map<BlockId, PageId> obtained from the search as state
  }, [query, search, setLoading]);
  const pageIds = [...results.values()];

  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1 && !page.trash
  );

  useEffect(() => {
    setShowCreatePage(resultsPageMeta.length ? false : true);
    //Determine whether to display the  ‘+ New page’
  }, [resultsPageMeta, setShowCreatePage]);
  return loading ? null : (
    <>
      {query ? (
        resultsPageMeta.length ? (
          <Command.Group heading={`Find ${resultsPageMeta.length} results`}>
            {resultsPageMeta.map(result => {
              return (
                <Command.Item
                  key={result.id}
                  onSelect={() => {
                    goToPage(result.id);
                    triggerQuickSearchModal();
                  }}
                  value={result.title}
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
            <span>Find 0 result</span>
          </StyledNotFound>
        )
      ) : (
        <Command.Group heading="Switch to">
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
