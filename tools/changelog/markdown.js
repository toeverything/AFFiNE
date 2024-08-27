import { jsxslack } from 'jsx-slack';
import { marked, Renderer } from 'marked';

export const render = markdown => {
  const rendered = marked(markdown, {
    renderer: new (class CustomRenderer extends Renderer {
      heading({ tokens }) {
        return `
          <Fragment>
            <Section><b>${tokens[0].text}</b></Section>
            <Divider />
          </Fragment>`;
      }

      list(token) {
        return `<Section>${super.list(token)}</Section>`;
      }

      hr() {
        return `<Divider />`;
      }
    })(),
  });
  return jsxslack([`<Blocks>${rendered}</Blocks>`]);
};
