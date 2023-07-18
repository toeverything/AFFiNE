import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { Command } from 'cmdk';
import { useAtomValue } from 'jotai';
import type { Dispatch, FC, SetStateAction } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { recentPageSettingsAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { AllWorkspace } from '../../../shared';
import { useSwitchToConfig } from './config';
import { StyledListItem, StyledNotFound } from './style';

export type ResultsProps = {
  workspace: AllWorkspace;
  query: string;
  onClose: () => void;
  setShowCreatePage: Dispatch<SetStateAction<boolean>>;
};
export const Results: FC<ResultsProps> = ({
  query,
  workspace,
  setShowCreatePage,
  onClose,
}) => {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const pageList = useBlockSuitePageMeta(blockSuiteWorkspace);
  assertExists(blockSuiteWorkspace.id);
  const List = useSwitchToConfig(workspace.id);

  const recentPageSetting = useAtomValue(recentPageSettingsAtom);
  const t = useAFFiNEI18N();
  const navigate = useNavigate();
  const { jumpToPage } = useNavigateHelper();
  const results = blockSuiteWorkspace.search({ query });

  // remove `space:` prefix
  const pageIds = [...results.values()].map(id => id.slice(6));

  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1 && !page.trash
  );

  const recentlyViewedItem = recentPageSetting.filter(recent => {
    const page = pageList.find(page => recent.id === page.id);
    if (!page) {
      return false;
    } else {
      return page.trash !== true;
    }
  });
  useEffect(() => {
    setShowCreatePage(!resultsPageMeta.length);
    //Determine whether to display the  ‘+ New page’
  }, [resultsPageMeta.length, setShowCreatePage]);
  if (!query) {
    return (
      <>
        {recentlyViewedItem.length > 0 && (
          <Command.Group heading={t['Recent']()}>
            {recentlyViewedItem.map(recent => {
              const page = pageList.find(page => recent.id === page.id);
              assertExists(page);
              return (
                <Command.Item
                  key={page.id}
                  value={page.id}
                  onSelect={() => {
                    onClose();
                    jumpToPage(blockSuiteWorkspace.id, page.id);
                  }}
                >
                  <StyledListItem>
                    {recent.mode === 'edgeless' ? (
                      <EdgelessIcon />
                    ) : (
                      <PageIcon />
                    )}
                    <span>{page.title || UNTITLED_WORKSPACE_NAME}</span>
                  </StyledListItem>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
        <Command.Group heading={t['Jump to']()}>
          {List.map(link => {
            return (
              <Command.Item
                key={link.title}
                value={link.title}
                onSelect={() => {
                  onClose();
                  link.href && navigate(link.href);
                  link.onClick?.();
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
      </>
    );
  }
  if (!resultsPageMeta.length) {
    return (
      <StyledNotFound>
        <span>{t['Find 0 result']()}</span>
        <image href="/imgs/no-result.svg" width={200} height={200} />
      </StyledNotFound>
    );
  }
  return (
    <Command.Group
      heading={t['Find results']({ number: `${resultsPageMeta.length}` })}
    >
      {resultsPageMeta.map(result => {
        return (
          <Command.Item
            key={result.id}
            onSelect={() => {
              onClose();
              assertExists(blockSuiteWorkspace.id);
              jumpToPage(blockSuiteWorkspace.id, result.id);
            }}
            value={result.id}
          >
            <StyledListItem>
              {result.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
              <span>{result.title || UNTITLED_WORKSPACE_NAME}</span>
            </StyledListItem>
          </Command.Item>
        );
      })}
    </Command.Group>
  );
};
