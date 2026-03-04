import test from 'ava';
import { z } from 'zod';

import {
  chatToGPTMessage,
  CitationFootnoteFormatter,
  CitationParser,
  StreamPatternParser,
} from '../../plugins/copilot/providers/utils';

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

test('StreamPatternParser should keep state across chunks', t => {
  const parser = new StreamPatternParser(pattern => {
    if (pattern.kind === 'wrappedLink') {
      return `[^${pattern.url}]`;
    }
    if (pattern.kind === 'index') {
      return `[#${pattern.value}]`;
    }
    return `[${pattern.text}](${pattern.url})`;
  });

  const first = parser.write('ref ([AFFiNE](https://affine.pro');
  const second = parser.write(')) and [2]');

  t.is(first, 'ref ');
  t.is(second, '[^https://affine.pro] and [#2]');
  t.is(parser.end(), '');
});

test('CitationParser should convert wrapped links to numbered footnotes', t => {
  const parser = new CitationParser();

  const output = parser.parse('Use ([AFFiNE](https://affine.pro)) now');
  t.is(output, 'Use [^1] now');
  t.regex(
    parser.end(),
    /\[\^1\]: \{"type":"url","url":"https%3A%2F%2Faffine.pro"\}/
  );
});

test('chatToGPTMessage should not mutate input and should keep system schema', async t => {
  const schema = z.object({
    query: z.string(),
  });
  const messages = [
    {
      role: 'system' as const,
      content: 'You are helper',
      params: { schema },
    },
    {
      role: 'user' as const,
      content: '',
      attachments: ['https://example.com/a.png'],
    },
  ];
  const firstRef = messages[0];
  const secondRef = messages[1];
  const [system, normalized, parsedSchema] = await chatToGPTMessage(
    messages,
    false
  );

  t.is(system, 'You are helper');
  t.is(parsedSchema, schema);
  t.is(messages.length, 2);
  t.is(messages[0], firstRef);
  t.is(messages[1], secondRef);
  t.deepEqual(normalized[0], {
    role: 'user',
    content: [{ type: 'text', text: '[no content]' }],
  });
});
