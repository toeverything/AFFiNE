import React from 'react';
import { Command, useCommandState } from 'cmdk';

const NoResult = (props: { query: string }) => {
  const search = useCommandState(state => state.search);
  return <Command.Empty>No results found for "{search}".</Command.Empty>;
};

export default NoResult;
