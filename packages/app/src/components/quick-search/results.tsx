import { Command } from 'cmdk';
import { StyledListItem } from './style';
import Link from 'next/link';
import { useModal } from '@/providers/global-modal-provider';
import { AllPagesIcon, FavouritesIcon, TrashIcon } from '@blocksuite/icons';
import { useEditor } from '@/providers/editor-provider';
import { useEffect, useState } from 'react';

export const Results = (props: { query: string }) => {
  const query = props.query;
  const { triggerQuickSearchModal } = useModal();
  const { search, openPage, pageList } = useEditor();
  const [results, setResults] = useState(new Map<string, string | undefined>());
  useEffect(() => {
    return setResults(search(query));
    //Save the Map<BlockId, PageId> obtained from the search as state
  }, [query, search]);
  const pageIds = [...results.values()];

  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1
  );
  return (
    <Command.List>
      <Command.Empty>No results found for &quot;{query}&quot;.</Command.Empty>
      <Command.Group>
        {resultsPageMeta.map(result => {
          return (
            <Command.Item
              key={result.id}
              onSelect={() => {
                openPage(result.id);
                triggerQuickSearchModal();
              }}
              value={result.title}
            >
              <StyledListItem>{result.title}</StyledListItem>
            </Command.Item>
          );
        })}
      </Command.Group>
      <Command.Group heading="Jump to">
        <Command.Item>
          <StyledListItem>
            <Link
              href={{ pathname: '/page-list/all' }}
              onClick={() => triggerQuickSearchModal()}
            >
              <AllPagesIcon />
              <span> All pages</span>
            </Link>
          </StyledListItem>
        </Command.Item>
        <Command.Item>
          <StyledListItem>
            <Link
              href={{ pathname: '/page-list/favorite' }}
              onClick={() => triggerQuickSearchModal()}
            >
              <FavouritesIcon />
              <span> Favourites</span>
            </Link>
          </StyledListItem>
        </Command.Item>
        <Command.Item>
          <StyledListItem>
            <Link
              href={{ pathname: '/page-list/trash' }}
              onClick={() => triggerQuickSearchModal()}
            >
              <TrashIcon />
              <span> Trash</span>
            </Link>
          </StyledListItem>
        </Command.Item>
      </Command.Group>
    </Command.List>
  );
};
