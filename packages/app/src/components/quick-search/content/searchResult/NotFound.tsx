import React from 'react';
import { Command, useCommandState } from 'cmdk';

const noResult = () => {
  const search = useCommandState(state => state.search);
  return <Command.Empty>No results found for "{search}".</Command.Empty>;
};

export default noResult;
