import React from 'react';
import JumpTo from './JumpTo';
import { Command } from 'cmdk';
import SearchResult from './searchResult';

const Result = (props: { search: string }) => {
  return (
    <Command.List>{props.search ? <SearchResult /> : <JumpTo />}</Command.List>
  );
};

export default Result;
