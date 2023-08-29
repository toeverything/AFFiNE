import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { Command } from 'cmdk';
import { type Atom, atom, useAtomValue } from 'jotai';
import type { Dispatch, SetStateAction } from 'react';
import { startTransition, useEffect } from 'react';

import { recentPageSettingsAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { AllWorkspace } from '../../../shared';
import { useSwitchToConfig } from './config';
import { StyledListItem, StyledNotFound } from './style';

export interface ResultsProps {
  workspace: AllWorkspace;
  query: string;
  onClose: () => void;
  setShowCreatePage: Dispatch<SetStateAction<boolean>>;
}

const loadAllPageWeakMap = new WeakMap<Workspace, Atom<Promise<void>>>();

function getLoadAllPage(workspace: Workspace) {
  if (loadAllPageWeakMap.has(workspace)) {
    return loadAllPageWeakMap.get(workspace) as Atom<Promise<void>>;
  } else {
    const aAtom = atom(async () => {
      // fixme: we have to load all pages here and re-index them
      //  there might have performance issue
      await Promise.all(
        [...workspace.pages.values()].map(page =>
          page.waitForLoaded().then(() => {
            workspace.indexer.search.refreshPageIndex(page.id, page.spaceDoc);
          })
        )
      );
    });
    loadAllPageWeakMap.set(workspace, aAtom);
    return aAtom;
  }
}

export const Results = ({
  query,
  workspace,
  setShowCreatePage,
  onClose,
}: ResultsProps) => {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const pageList = useBlockSuitePageMeta(blockSuiteWorkspace);
  assertExists(blockSuiteWorkspace.id);
  const list = useSwitchToConfig(workspace.id);
  useAtomValue(getLoadAllPage(blockSuiteWorkspace));

  const recentPageSetting = useAtomValue(recentPageSettingsAtom);
  const t = useAFFiNEI18N();
  const { jumpToPage, jumpToSubPath } = useNavigateHelper();
  const pageIds = [...blockSuiteWorkspace.search({ query }).values()].map(
    id => {
      if (id.startsWith('space:')) {
        return id.slice(6);
      } else {
        return id;
      }
    }
  );

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
    startTransition(() => {
      setShowCreatePage(resultsPageMeta.length === 0);
    });
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
          {list.map(link => {
            return (
              <Command.Item
                key={link.title}
                value={link.title}
                onSelect={() => {
                  onClose();
                  if ('subPath' in link) {
                    jumpToSubPath(blockSuiteWorkspace.id, link.subPath);
                  } else if ('onClick' in link) {
                    link.onClick();
                  } else {
                    throw new Error('Invalid link');
                  }
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
        <img
          alt="no result"
          src="/imgs/no-result.svg"
          width={200}
          height={200}
        />
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
