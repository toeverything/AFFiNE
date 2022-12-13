import React from 'react';
import { Command, useCommandState } from 'cmdk';

const NotFound = () => {
  const search = useCommandState(state => state.search);
  // eslint-disable-next-line react/no-unescaped-entities
  return <Command.Empty>No results found for "{search}".</Command.Empty>;
};

export default NotFound;
