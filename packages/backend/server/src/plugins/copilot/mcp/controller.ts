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

import { Throttle } from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { WorkspaceMcpProvider, type WorkspaceMcpServer } from './provider';

type JsonRpcId = string | number | null;

type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  error: { code: number; message: string };
  id: JsonRpcId;
};

type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  result: Record<string, unknown>;
  id: JsonRpcId;
};

type JsonRpcResponse = JsonRpcErrorResponse | JsonRpcSuccessResponse;

const JSON_RPC_VERSION = '2.0';
const MAX_BATCH_SIZE = 20;
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]);

@Controller('/api/workspaces/:workspaceId/mcp')
export class WorkspaceMcpController {
  private readonly logger = new Logger(WorkspaceMcpController.name);

  constructor(private readonly provider: WorkspaceMcpProvider) {}

  @Get('/')
  @Delete('/')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  async STATELESS_MCP_ENDPOINT() {
    return this.errorResponse(null, -32000, 'Method not allowed.');
  }

  @Throttle('default')
  @Post('/')
  async mcp(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Param('workspaceId') workspaceId: string
  ) {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      const server = await this.provider.for(user.id, workspaceId);
      const body = req.body as unknown;
      const isBatch = Array.isArray(body);
      const messages = isBatch ? body : [body];

      if (!messages.length) {
        res
          .status(HttpStatus.BAD_REQUEST)
          .json(this.errorResponse(null, -32600, 'Invalid Request'));
        return;
      }
      if (messages.length > MAX_BATCH_SIZE) {
        res
          .status(HttpStatus.BAD_REQUEST)
          .json(
            this.errorResponse(
              null,
              -32600,
              `Batch size exceeds limit (${MAX_BATCH_SIZE}).`
            )
          );
        return;
      }

      const responses: JsonRpcResponse[] = [];
      for (const message of messages) {
        const response = await this.handleMessage(
          message,
          server,
          abortController.signal
        );
        if (response) {
          responses.push(response);
        }
      }

      if (!responses.length) {
        res.status(HttpStatus.ACCEPTED).send();
        return;
      }

      res.status(HttpStatus.OK).json(isBatch ? responses : responses[0]);
    } catch (error) {
      this.logger.error('Failed to handle MCP request', error);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json(this.errorResponse(null, -32603, 'Internal error'));
    }
  }

  private async handleMessage(
    message: unknown,
    server: WorkspaceMcpServer,
    signal: AbortSignal
  ): Promise<JsonRpcResponse | null> {
    const rawRequest = this.asObject(message);
    if (!rawRequest || rawRequest.jsonrpc !== JSON_RPC_VERSION) {
      return this.errorResponse(null, -32600, 'Invalid Request');
    }

    const method = rawRequest.method;
    if (typeof method !== 'string') {
      return this.errorResponse(null, -32600, 'Invalid Request');
    }

    const id = this.parseRequestId(rawRequest.id);
    if (id === 'invalid') {
      return this.errorResponse(null, -32600, 'Invalid Request');
    }

    const isNotification = id === undefined;
    const responseId = id ?? null;

    switch (method) {
      case 'initialize': {
        const params = this.asObject(rawRequest.params);
        const requestedVersion =
          params && typeof params.protocolVersion === 'string'
            ? params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(
          requestedVersion
        )
          ? requestedVersion
          : DEFAULT_PROTOCOL_VERSION;

        if (isNotification) return null;

        return this.successResponse(responseId, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: server.name, version: server.version },
        });
      }

      case 'notifications/initialized':
      case 'ping': {
        if (isNotification) {
          return null;
        }
        return this.successResponse(responseId, {});
      }

      case 'tools/list': {
        if (isNotification) {
          return null;
        }
        return this.successResponse(responseId, {
          tools: server.tools.map(tool => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
      }

      case 'tools/call': {
        const params = this.asObject(rawRequest.params);
        if (!params || typeof params.name !== 'string') {
          return this.errorResponse(responseId, -32602, 'Invalid params');
        }

        const tool = server.tools.find(item => item.name === params.name);
        if (!tool) {
          return this.errorResponse(
            responseId,
            -32602,
            `Tool not found: ${params.name}`
          );
        }

        const args = this.asObject(params.arguments) ?? {};
        try {
          const result = await tool.execute(args, { signal });
          if (isNotification) return null;

          return this.successResponse(
            responseId,
            result as Record<string, unknown>
          );
        } catch (error) {
          this.logger.error(
            `Error executing tool in mcp ${tool.name}`,
            error instanceof Error ? error.stack : String(error)
          );
          return this.errorResponse(
            responseId,
            -32001,
            `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      default: {
        if (isNotification) return null;
        return this.errorResponse(responseId, -32601, 'Method not found');
      }
    }
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private parseRequestId(value: unknown): JsonRpcId | undefined | 'invalid' {
    if (value === undefined) return undefined;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      return value;
    }
    return 'invalid';
  }

  private successResponse(
    id: JsonRpcId,
    result: Record<string, unknown>
  ): JsonRpcSuccessResponse {
    return { jsonrpc: JSON_RPC_VERSION, result, id };
  }

  private errorResponse(
    id: JsonRpcId,
    code: number,
    message: string
  ): JsonRpcErrorResponse {
    return { jsonrpc: JSON_RPC_VERSION, error: { code, message }, id };
  }
}
