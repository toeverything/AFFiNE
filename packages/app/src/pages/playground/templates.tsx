import { ReactElement, useRef } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import exampleMarkdown from '@/templates/Welcome-to-the-AFFiNE-Alpha.md';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useAppState } from '@/providers/app-state-provider/context';
interface Template {
  name: string;
  source: string;
}
const TemplateItemContainer = styled('div')(() => {
  return {
    padding: '10px 15px',
    borderBottom: '1px solid #eee',
    cursor: 'pointer',
    '&:hover': {
      background: '#eee',
    },
  };
});
import { styled } from '@/styles';
const TEMPLATES: Template[] = [
  {
    name: 'Template xx',
    source: exampleMarkdown,
  },
  {
    name: 'Template xx1',
    source: exampleMarkdown,
  },
  {
    name: 'Template xx2',
    source: exampleMarkdown,
  },
];

const All = () => {
  const { openPage, createPage } = usePageHelper();
  const { createEditor, setEditor, currentWorkspace } = useAppState();

  const _applyTemplate = function (pageId: string, template: Template) {
    const page = currentWorkspace?.getPage(pageId);

    const title = template.name;
    currentWorkspace?.setPageMeta(page!.id, { title });
    if (page && page.root === null) {
      // console.log(page);
      // const pageBlockId = page.addBlock({ flavour: 'affine:page' });
      // const groupId = page.addBlock({ flavour: 'affine:group' }, pageId);
      // page.addBlock({ flavour: 'affine:paragraph' });
      // page.resetHistory();
      // page.setBlockContent(groupId, template.source);
    }
  };
  const _handleAppleTemplate = async function (template: Template) {
    console.log(template);
    const pageId = await createPage();
    if (pageId) {
      openPage(pageId);
      _applyTemplate(pageId, template);
    }
  };

  return (
    <div style={{ padding: '50px' }}>
      <div>
        {TEMPLATES.map(template => {
          return (
            <TemplateItemContainer
              key={template.name}
              onClick={() => _handleAppleTemplate(template)}
            >
              {template.name}
              <a style={{ marginLeft: '20px' }}> New Page by this Template</a>
            </TemplateItemContainer>
          );
        })}
      </div>
    </div>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
