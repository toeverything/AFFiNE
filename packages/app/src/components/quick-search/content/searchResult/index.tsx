import { useEffect, useState } from 'react';
import NotFound from './not-found';
import { Command } from 'cmdk';
import { useEditor } from '@/providers/editor-provider';

const SearchResult = (props: { query: string }) => {
  const { search, openPage, pageList } = useEditor();
  const [results, setResults] = useState(new Map<string, string | undefined>());
  const query = props.query;
  useEffect(() => {
    return setResults(search(query));
    //Save the Map<BlockId, PageId> obtained from the search as state
  }, [query, search]);
  const pageIds = [...results.values()];

  const resultsPageMeta = pageList.filter(
    page => pageIds.indexOf(page.id) > -1
  );

  return (
    <>
      <NotFound />
      {resultsPageMeta.map(result => {
        return <Command.Item key={result.id}>{result.title}</Command.Item>;
      })}
    </>
  );
};

export default SearchResult;
