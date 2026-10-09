import type { Image, Link } from 'mdast';
import { defaultHandlers, type Handlers } from 'mdast-util-to-markdown';

// The serializer escapes every & that a letter or # follows, which puts a
// backslash in front of most query parameters. Only an & that completes a
// character reference has to stay escaped, and the shape is tested rather
// than the list of entity names, so an unknown name keeps its backslash.
const CHARACTER_REFERENCE =
  /^&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/;

// The destination and its optional title, at the end of one link or image.
const DESTINATION =
  /\]\((<[^<>]*>|(?:\\.|[^\s()])*)((?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\))$/;

function unescapeAmpersands(destination: string) {
  return destination.replace(/\\&/g, (match, offset: number) =>
    CHARACTER_REFERENCE.test(`&${destination.slice(offset + 2)}`) ? match : '&'
  );
}

function readableDestination(serialized: string) {
  return serialized.replace(
    DESTINATION,
    (_, destination: string, tail: string) =>
      `](${unescapeAmpersands(destination)}${tail}`
  );
}

// Applied per node, so a link shaped string inside code keeps its escapes.
export const linkDestinationHandlers: Partial<Handlers> = {
  image: (node: Image, parent, state, info) =>
    readableDestination(defaultHandlers.image(node, parent, state, info)),
  link: (node: Link, parent, state, info) =>
    readableDestination(defaultHandlers.link(node, parent, state, info)),
};
