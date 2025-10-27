import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../../core/auth';
import { WorkspaceMcpProvider } from './provider';

@Controller('/api/workspaces/:workspaceId/mcp')
export class WorkspaceMcpController {
  private readonly logger = new Logger(WorkspaceMcpController.name);
  constructor(private readonly provider: WorkspaceMcpProvider) {}

  @Get('/')
  @Delete('/')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  async STATELESS_MCP_ENDPOINT() {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    };
  }

  @Post('/')
  async mcp(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Param('workspaceId') workspaceId: string
  ) {
    let server = await this.provider.for(user.id, workspaceId);

    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

    const cleanup = () => {
      transport.close().catch(e => {
        this.logger.error('Failed to close MCP transport', e);
      });
      server.close().catch(e => {
        this.logger.error('Failed to close MCP server', e);
      });
    };

    try {
      res.on('close', cleanup);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      cleanup();
    }
  }
}
