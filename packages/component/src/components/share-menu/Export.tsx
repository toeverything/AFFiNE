import { Button } from '../..';
import { StyledExportWrapper } from './styles';
const Export = () => {
  return (
    <StyledExportWrapper>
      <div>Download a static copy of your page to share with others.</div>
      <Button
        onClick={() => {
          // @ts-expect-error
          globalThis.currentEditor.contentParser.onExportHtml();
        }}
      >
        Export to HTML
      </Button>
      <Button
        onClick={() => {
          // @ts-expect-error
          globalThis.currentEditor.contentParser.onExportMarkdown();
        }}
      >
        Export to Markdown
      </Button>
    </StyledExportWrapper>
  );
};

export default Export;
