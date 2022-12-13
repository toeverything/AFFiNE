import { useEffect, useState } from 'react';
import NoResult from './NotFound';
import { Command } from 'cmdk';
import { useEditor } from '@/providers/editor-provider';

const SearchResult = (props: { query: string }) => {
  const { pageList, search, getPageMeta, openPage } = useEditor();
  const [results, setResults] = useState({});
  const query = props.query;
  useEffect(() => {
    setResults(search(query));
  }, [query]);

  return (
    <>
      <NoResult />

      <Command.Item>Apple</Command.Item>
    </>
  );
};

export default SearchResult;
