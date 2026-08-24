import test from 'ava';

import { CitationFootnoteFormatter } from '../../plugins/copilot/providers/utils';

test('CitationFootnoteFormatter should format sorted footnotes from citation events', t => {
  const formatter = new CitationFootnoteFormatter();

  formatter.consume({
    type: 'citation',
    index: 2,
    url: 'https://example.com/b',
  });
  formatter.consume({
    type: 'citation',
    index: 1,
    url: 'https://example.com/a',
  });

  t.is(
    formatter.end(),
    [
      '[^1]: {"type":"url","url":"https%3A%2F%2Fexample.com%2Fa"}',
      '[^2]: {"type":"url","url":"https%3A%2F%2Fexample.com%2Fb"}',
    ].join('\n')
  );
});

test('CitationFootnoteFormatter should overwrite duplicated index with latest url', t => {
  const formatter = new CitationFootnoteFormatter();

  formatter.consume({
    type: 'citation',
    index: 1,
    url: 'https://example.com/old',
  });
  formatter.consume({
    type: 'citation',
    index: 1,
    url: 'https://example.com/new',
  });

  t.is(
    formatter.end(),
    '[^1]: {"type":"url","url":"https%3A%2F%2Fexample.com%2Fnew"}'
  );
});
