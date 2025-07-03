import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  RawBody,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { NotFound, SkipThrottle } from '../../base';
import { Internal } from '../auth';
import { DatabaseDocReader } from '../doc';

@Controller('/rpc')
export class DocRpcController {
  private readonly logger = new Logger(DocRpcController.name);

  constructor(private readonly docReader: DatabaseDocReader) {}

  @SkipThrottle()
  @Internal()
  @Get('/workspaces/:workspaceId/docs/:docId')
  async getDoc(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string,
    @Res() res: Response
  ) {
    const doc = await this.docReader.getDoc(workspaceId, docId);
    if (!doc) {
      throw new NotFound('Doc not found');
    }
    this.logger.debug(
      `get doc ${docId} from workspace ${workspaceId}, size: ${doc.bin.length}`
    );
    res.setHeader('x-doc-timestamp', doc.timestamp.toString());
    if (doc.editor) {
      res.setHeader('x-doc-editor-id', doc.editor);
    }
    res.send(doc.bin);
  }

  @SkipThrottle()
  @Internal()
  @Get('/workspaces/:workspaceId/docs/:docId/markdown')
  async getDocMarkdown(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string,
    @Query('aiEditable') aiEditable?: string
  ) {
    const result = await this.docReader.getDocMarkdown(
      workspaceId,
      docId,
      aiEditable === 'true'
    );
    if (!result) {
      throw new NotFound('Doc not found');
    }
    return result;
  }

  @SkipThrottle()
  @Internal()
  @Post('/workspaces/:workspaceId/docs/:docId/diff')
  async getDocDiff(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string,
    @RawBody() stateVector: Buffer | undefined,
    @Res() res: Response
  ) {
    const diff = await this.docReader.getDocDiff(
      workspaceId,
      docId,
      stateVector
    );
    if (!diff) {
      throw new NotFound('Doc not found');
    }
    this.logger.debug(
      `get doc diff ${docId} from workspace ${workspaceId}, missing size: ${diff.missing.length}, old state size: ${stateVector?.length}, new state size: ${diff.state.length}`
    );
    res.setHeader('x-doc-timestamp', diff.timestamp.toString());
    res.setHeader('x-doc-missing-offset', `0,${diff.missing.length}`);
    const stateOffset = diff.missing.length;
    res.setHeader(
      'x-doc-state-offset',
      `${stateOffset},${stateOffset + diff.state.length}`
    );
    res.send(Buffer.concat([diff.missing, diff.state]));
  }

  @SkipThrottle()
  @Internal()
  @Get('/workspaces/:workspaceId/docs/:docId/content')
  async getDocContent(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string,
    @Query('full') fullContent?: string
  ) {
    const content =
      fullContent === 'true'
        ? await this.docReader.getFullDocContent(workspaceId, docId)
        : await this.docReader.getDocContent(workspaceId, docId);
    if (!content) {
      throw new NotFound('Doc not found');
    }
    this.logger.debug(`get doc content ${docId} from workspace ${workspaceId}`);
    return content;
  }

  @SkipThrottle()
  @Internal()
  @Get('/workspaces/:workspaceId/content')
  async getWorkspaceContent(@Param('workspaceId') workspaceId: string) {
    const content = await this.docReader.getWorkspaceContent(workspaceId);
    if (!content) {
      throw new NotFound('Workspace not found');
    }
    this.logger.debug(`get workspace content ${workspaceId}`);
    return content;
  }
}
