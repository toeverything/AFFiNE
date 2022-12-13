import React from 'react';
import JumpTo from './jumpTo';
import { Command } from 'cmdk';
import SearchResult from './searchResult';

const Result = (props: { query: string }) => {
  const query = props.query;

  return (
    <Command.List>
      {query ? <SearchResult query={query} /> : <JumpTo />}
    </Command.List>
  );
};

export default Result;
