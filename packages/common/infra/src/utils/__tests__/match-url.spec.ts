import { expect, test } from 'vitest';

import { matchUrl } from '../match-url';

test('matchUrl', () => {
  expect([
    ...matchUrl(`
    text http://example.com text
    text https://example.com text http://example.com
    example.com localhost localhost:8080
    http://localhost:8080 example.com/foo/bar
    http://foo.com/blah_(wikipedia)#cite-1
	http://foo.com/blah_(wikipedia)_blah#cite-1
	http://foo.com/unicode_(✪)_in_parens
	http://foo.com/(something)?after=parens
    (Something like http://foo.com/blah_blah_(wikipedia))
	http://foo.com/blah_blah.
	http://foo.com/blah_blah/.
    6:00p
    filename.txt
    www.example.com
    WWW.EXAMPLE.COM
    “is.gd/foo/”
    http://example.com/something?with,commas,in,url, but not at end
    http://example.com/something?with,。,in,url。 but not at end
    http://example.com/something?with,【】,in,url【】 but not at end
    http://example.com/something?with,"",in,url"" but not at end
    <http://example.com/something?within>
    「http://example.com/something?with「」inurl」
	What about <mailto:gruber@daringfireball.net?subject=TEST> (including brokets).
    `),
  ]).toMatchSnapshot();
});
