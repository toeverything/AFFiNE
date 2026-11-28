import { strToU8, zipSync } from 'fflate';
import { describe, expect, test, vi } from 'vitest';

import { parseXmindFile } from '../toolbar/utils/import-mindmap.js';

function xmindFile(entries: Record<string, string>) {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, content]) => [name, strToU8(content)])
    )
  );
  return new File([zipped], 'map.xmind');
}

describe('parseXmindFile', () => {
  test('reads content.json from XMind 2020 and later', async () => {
    const content = [
      {
        class: 'sheet',
        title: 'Sheet 1',
        rootTopic: {
          title: 'Central Topic',
          children: {
            attached: [
              {
                title: 'Main Topic 1',
                children: { attached: [{ title: 'Subtopic' }] },
              },
              { title: 'Main Topic 2' },
            ],
            detached: [{ title: 'Floating Topic' }],
          },
        },
      },
      { class: 'sheet', title: 'Sheet 2', rootTopic: { title: 'Other' } },
    ];
    const file = xmindFile({
      'content.json': JSON.stringify(content),
      // XMind 2020+ also writes a placeholder content.xml
      'content.xml': '<xmap-content />',
    });

    expect(await parseXmindFile(file)).toEqual({
      text: 'Central Topic',
      children: [
        {
          text: 'Main Topic 1',
          children: [{ text: 'Subtopic', children: [] }],
        },
        { text: 'Main Topic 2', children: [] },
      ],
    });
  });

  test('reads content.xml from XMind 8', async () => {
    const content = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0">
  <sheet id="s1">
    <topic id="t0">
      <title>Central Topic</title>
      <children>
        <topics type="attached">
          <topic id="t1">
            <title>Research &amp; Design</title>
            <children>
              <topics type="attached">
                <topic id="t2"><title>Subtopic</title></topic>
              </topics>
            </children>
          </topic>
          <topic id="t3"><title>Main Topic 2</title></topic>
        </topics>
        <topics type="detached">
          <topic id="t4"><title>Floating Topic</title></topic>
        </topics>
      </children>
    </topic>
    <title>Sheet 1</title>
  </sheet>
</xmap-content>`;

    expect(await parseXmindFile(xmindFile({ 'content.xml': content }))).toEqual(
      {
        text: 'Central Topic',
        children: [
          {
            text: 'Research & Design',
            children: [{ text: 'Subtopic', children: [] }],
          },
          { text: 'Main Topic 2', children: [] },
        ],
      }
    );
  });

  test('rejects files without map content', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      parseXmindFile(xmindFile({ 'manifest.json': '{}' }))
    ).rejects.toThrow('Failed to parse XMind file');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
