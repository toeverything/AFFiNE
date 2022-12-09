import React from 'react';
import NoResult from './NotFound';
import { Command } from 'cmdk';
import Store from '@blocksuite/store';

const SearchResult = () => {
  return (
    <>
      <NoResult />
      <Command.Group heading="Letters">
        <Command.Item>a</Command.Item>
        <Command.Item>b</Command.Item>
        <Command.Separator />
        <Command.Item>c</Command.Item>
      </Command.Group>
      <Command.Item>Apple</Command.Item>
    </>
  );
};

export default SearchResult;
