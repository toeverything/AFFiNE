import { useEffect, useState } from 'react';
import NoResult from './notFound';
import { Command } from 'cmdk';
import { PageMeta, useEditor } from '@/providers/editor-provider';

function renderPages(resultsPageMeta: PageMeta[]) {
  return resultsPageMeta.map(resultPageMeta => {
    return <Command.Item>{resultPageMeta.title}</Command.Item>;
  });
}

const SearchResult = (props: { query: string }) => {
  const { search, getPageMeta, openPage } = useEditor();
  const [results, setResults] = useState(new Map<string, string>());
  const query = props.query;
  useEffect(() => {
    setResults(search(query));
    //Save the Map<BlockId, PageId> obtained from the search as state
  }, [query]);

  const resultsPageMeta: PageMeta[] = [];

  results.forEach(pageId => {
    const pageMeta = getPageMeta(pageId);
    if (pageMeta) {
      //Get pageMeta just like { title , id , text...}
      resultsPageMeta.push(pageMeta);
    }
  });
  return (
    <>
      {resultsPageMeta.length ? (
        renderPages(resultsPageMeta)
      ) : (
        <NoResult query={query} />
      )}
    </>
  );
};

export default SearchResult;
