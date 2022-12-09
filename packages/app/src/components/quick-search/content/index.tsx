import React from 'react';
import JumpTo from './JumpTo';
import { Command } from 'cmdk';
import SearchResult from './searchResult';

const Result = (props: { result: string }) => {
  return (
    <Command.List>{props.result ? <SearchResult /> : <JumpTo />}</Command.List>
  );
};

export default Result;
