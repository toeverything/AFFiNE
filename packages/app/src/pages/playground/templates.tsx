import { ReactElement, useRef } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import exampleMarkdown1 from '@/templates/Welcome-to-the-AFFiNE-Alpha.md';
import exampleMarkdown2 from '@/templates/AFFiNE-Docs.md';

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
    name: 'Welcome-to-the-AFFiNE-Alpha.md',
    source: exampleMarkdown1,
  },
  {
    name: 'AFFiNE-Docs.md',
    source: exampleMarkdown2,
  },
];

const All = () => {
  const { openPage, createPage } = usePageHelper();
  const { currentWorkspace } = useAppState();
  const selectFile = useRef<HTMLInputElement>(null);
  const _applyTemplate = function (pageId: string, template: Template) {
    const page = currentWorkspace?.getPage(pageId);

    const title = template.name;
    currentWorkspace?.setPageMeta(page!.id, { title });
    if (page && page.root === null) {
      setTimeout(() => {
        const editor = document.querySelector('editor-container');
        if (editor) {
          const groupId = page.addBlock({ flavour: 'affine:group' }, pageId);
          // TODO blocksuite should offer a method to import markdown from store
          editor.clipboard.importMarkdown(template.source, `${groupId}`);
          page.resetHistory();
          editor.requestUpdate();
        }
      }, 300);
    }
  };
  const _handleAppleTemplate = async function (template: Template) {
    const pageId = await createPage();
    if (pageId) {
      openPage(pageId);
      _applyTemplate(pageId, template);
    }
  };
  const _handleAppleTemplateFromRemoteUrl = async () => {
    const arrFileHandle = await window.showOpenFilePicker({
      types: [
        {
          accept: {
            'image/*': ['.md'],
          },
        },
      ],
      multiple: false,
    });
    for (const fileHandle of arrFileHandle) {
      const file = await fileHandle.getFile();
      const text = await file.text();
      _handleAppleTemplate({
        name: file.name,
        source: text,
      });
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
              <a style={{ marginLeft: '20px' }}> Apply Template</a>
            </TemplateItemContainer>
          );
        })}
        <TemplateItemContainer
          onClick={() => _handleAppleTemplateFromRemoteUrl()}
        >
          <a style={{ marginLeft: '20px' }}>
            Apply Template From Select Markdown File
          </a>
        </TemplateItemContainer>
      </div>
    </div>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
