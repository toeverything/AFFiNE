import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';

import { onlyContainImgElement } from '../clipboard/utils.js';

describe('only contains img elements', () => {
  test('normal with head', () => {
    const htmlAst = unified().use(rehypeParse).parse(`<html>
<head></head>
<body>
<!--StartFragment--><img src="https://files.slack.com/deadbeef.png" alt="image.png"/><!--EndFragment-->
</body>
</html>`);
    const isImgOnly =
      htmlAst.children.map(onlyContainImgElement).reduce((a, b) => {
        if (a === 'no' || b === 'no') {
          return 'no';
        }
        if (a === 'maybe' && b === 'maybe') {
          return 'maybe';
        }
        return 'yes';
      }, 'maybe') === 'yes';
    expect(isImgOnly).toBe(true);
  });

  test('normal without head', () => {
    const htmlAst = unified().use(rehypeParse).parse(`<html>
<body>
<!--StartFragment--><img src="https://files.slack.com/deadbeef.png" alt="image.png"/><!--EndFragment-->
</body>
</html>`);
    const isImgOnly =
      htmlAst.children.map(onlyContainImgElement).reduce((a, b) => {
        if (a === 'no' || b === 'no') {
          return 'no';
        }
        if (a === 'maybe' && b === 'maybe') {
          return 'maybe';
        }
        return 'yes';
      }, 'maybe') === 'yes';
    expect(isImgOnly).toBe(true);
  });

  test('contain spans', () => {
    const htmlAst = unified().use(rehypeParse).parse(`<html>
<body>
<!--StartFragment--><img src="https://files.slack.com/deadbeef.png" alt="image.png"/><span></span><!--EndFragment-->
</body>
</html>`);
    const isImgOnly =
      htmlAst.children.map(onlyContainImgElement).reduce((a, b) => {
        if (a === 'no' || b === 'no') {
          return 'no';
        }
        if (a === 'maybe' && b === 'maybe') {
          return 'maybe';
        }
        return 'yes';
      }, 'maybe') === 'yes';
    expect(isImgOnly).toBe(false);
  });
});
