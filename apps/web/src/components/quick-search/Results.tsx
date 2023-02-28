import { useTranslation } from '@affine/i18n';
import { EdgelessIcon, PaperIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import { Dispatch, SetStateAction, useCallback, useEffect } from 'react';

import usePageHelper from '@/hooks/use-page-helper';
import { useGlobalState } from '@/store/app';

import { useSwitchToConfig } from './config';
import { NoResultSVG } from './NoResultSVG';
import { StyledListItem, StyledNotFound } from './style';

export const Results = ({
  query,
  setShowCreatePage,
  onClose,
}: {
  query: string;
  onClose: () => void;
  setShowCreatePage: Dispatch<SetStateAction<boolean>>;
}) => {
  const { openPage } = usePageHelper();
  const router = useRouter();
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const pageList = useGlobalState(
    useCallback(store => store.dataCenterPageList, [])
  );
  const { search } = usePageHelper();
  const List = useSwitchToConfig(currentWorkspace?.id);
  const { t } = useTranslation();

  const results = search(query);
  const pageIds = [...results.values()];
  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1 && !page.trash
  );

  // TODO lift this state up and remove this effect!
  useEffect(() => {
    setShowCreatePage(!resultsPageMeta.length);
    //Determine whether to display the  ‘+ New page’
  }, [resultsPageMeta, setShowCreatePage]);

  if (!query) {
    return (
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
    );
  }

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
              onClose();
              openPage(result.id);
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
