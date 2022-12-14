import { Command } from 'cmdk';
import { StyledListItem } from './style';
import { useModal } from '@/providers/global-modal-provider';
import {
  AllPagesIcon,
  FavouritesIcon,
  TrashIcon,
  PaperIcon,
} from '@blocksuite/icons';
import { useEditor } from '@/providers/editor-provider';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export const Results = (props: { query: string }) => {
  const query = props.query;
  const { triggerQuickSearchModal } = useModal();
  const { search, openPage, pageList } = useEditor();
  const router = useRouter();
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
              <StyledListItem>
                <PaperIcon />
                <span>{result.title}</span>
              </StyledListItem>
            </Command.Item>
          );
        })}
      </Command.Group>
      <Command.Group heading="Jump to">
        <Command.Item
          value="All pages"
          onSelect={() => {
            router.push('/page-list/all');
            triggerQuickSearchModal();
          }}
        >
          <StyledListItem>
            <AllPagesIcon />
            <span>All pages</span>
          </StyledListItem>
        </Command.Item>
        <Command.Item
          value="Favourites"
          onSelect={() => {
            router.push('/page-list/favorite');
            triggerQuickSearchModal();
          }}
        >
          <StyledListItem>
            <FavouritesIcon />
            <span>Favourites</span>
          </StyledListItem>
        </Command.Item>
        <Command.Item
          value="Trash"
          onSelect={() => {
            router.push('/page-list/trash');
            triggerQuickSearchModal();
          }}
        >
          <StyledListItem>
            <TrashIcon />
            <span>Trash</span>
          </StyledListItem>
        </Command.Item>
      </Command.Group>
    </Command.List>
  );
};
