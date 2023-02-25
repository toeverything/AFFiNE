import {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
  NextPage,
} from 'next';
import { useEffect, useState } from 'react';

import { PageDetailEditor } from '../../components/page-detail-editor';
import { StyledPage, StyledWrapper } from '../../layouts/styles';
import { BlockSuiteWorkspace } from '../../shared';
import { createEmptyBlockSuiteWorkspace } from '../../utils';

export type PreviewPageProps = {
  text: string;
};

export type PreviewPageParams = {
  previewId: string;
};

const PreviewPage: NextPage<PreviewPageProps> = ({
  text,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  const [blockSuiteWorkspace, setBlockSuiteWorkspace] =
    useState<BlockSuiteWorkspace | null>(null);
  useEffect(() => {
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace('preview');
    blockSuiteWorkspace.signals.pageAdded.once(() => {
      setBlockSuiteWorkspace(blockSuiteWorkspace);
    });
    blockSuiteWorkspace.createPage('preview');
    return () => {
      blockSuiteWorkspace.removePage('preview');
    };
  }, []);
  if (!blockSuiteWorkspace || !blockSuiteWorkspace.getPage('preview')) {
    return <>loading...</>;
  }
  return (
    <StyledPage>
      <StyledWrapper>
        <PageDetailEditor
          blockSuiteWorkspace={blockSuiteWorkspace}
          pageId="preview"
          onInit={(page, editor) => {
            const { title: metaTitle } = page.meta;
            blockSuiteWorkspace.setPageMeta(page.id, { title: metaTitle });
            const pageBlockId = page.addBlockByFlavour('affine:page', {
              title: metaTitle,
            });
            page.addBlockByFlavour('affine:surface', {}, null);
            const frameId = page.addBlockByFlavour(
              'affine:frame',
              {},
              pageBlockId
            );
            editor.clipboard.importMarkdown(text, frameId).then(() => {
              page.resetHistory();
            });
          }}
        />
      </StyledWrapper>
    </StyledPage>
  );
};

export default PreviewPage;

export const getStaticProps: GetStaticProps<
  PreviewPageProps,
  PreviewPageParams
> = async context => {
  const name = context.params?.previewId;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const markdown: string = await fs.readFile(
    path.resolve(process.cwd(), 'src', 'templates', `${name}.md`),
    'utf8'
  );
  if (!name) {
    return {
      redirect: {
        destination: '/404',
      },
      props: {
        text: '',
      },
    };
  }
  return {
    props: {
      text: markdown,
    },
  };
};

export const getStaticPaths: GetStaticPaths<PreviewPageParams> = () => {
  return {
    paths: [
      { params: { previewId: 'AFFiNE-Docs' } },
      { params: { previewId: 'Welcome-to-AFFiNE-Abbey-Alpha-Wood' } },
      { params: { previewId: 'Welcome-to-AFFiNE-Alpha-Downhills' } },
      { params: { previewId: 'Welcome-to-the-AFFiNE-Alpha' } },
    ],
    fallback: false,
  };
};
