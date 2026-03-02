/**
 * Agent Platform REST Controller
 * Versionado: /api/agent/v1/*
 *
 * Uses AFFiNE's auth system — @Public() for config, authenticated for the rest.
 * Includes SSE streaming endpoint for chat.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Patch,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Logger,
  Sse,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, Subject } from 'rxjs';
import {
  AgentStep,
  CreateRunRequest,
  ExecuteStepRequest,
  AnalyzeAmbiguityRequest,
  GeneratePlanRequest,
  ProposeChangesRequest,
  ApproveRequest,
  ApplyRequest,
  CreatePRRequest,
  ConnectRepoRequest,
} from '@aion/agent-contracts';
import { Public, CurrentUser } from '../../core/auth';
import type { CurrentUser as CurrentUserType } from '../../core/auth';
import { AgentPlatformService } from './agent.service';
import { ClaudeCodeAdapter } from './llm/claude-code.adapter';
import { AgentStorageService } from './storage/prisma.adapter';

interface SseMessage {
  data: string;
}

@Controller('/api/agent/v1')
export class AgentPlatformController {
  private readonly logger = new Logger(AgentPlatformController.name);

  constructor(
    private readonly agentService: AgentPlatformService,
    private readonly claudeCode: ClaudeCodeAdapter,
    private readonly storage: AgentStorageService
  ) {}

  // ─── GET /api/agent/v1/config (public) ────────────────────────────────

  @Public()
  @Get('config')
  async getConfig() {
    return this.agentService.getConfig();
  }

  // ─── POST /api/agent/v1/runs ──────────────────────────────────────────

  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  async createRun(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    const parsed = CreateRunRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const { workspaceId, docId, briefContent, repoTarget, docTitle } =
      parsed.data;
    return this.agentService.createRun(
      workspaceId,
      docId,
      briefContent,
      repoTarget,
      docTitle
    );
  }

  // ─── GET /api/agent/v1/runs/:runId ────────────────────────────────────

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    const run = await this.agentService.getRunDetails(runId);
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }

  // ─── POST /api/agent/v1/runs/:runId/ambiguity ────────────────────────

  @Post('runs/:runId/ambiguity')
  async analyzeAmbiguity(@Param('runId') runId: string, @Body() body: unknown) {
    const parsed = AnalyzeAmbiguityRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.agentService.analyzeAmbiguity(runId, parsed.data.briefContent);
  }

  // ─── POST /api/agent/v1/runs/:runId/plan ──────────────────────────────

  @Post('runs/:runId/plan')
  async generatePlan(@Param('runId') runId: string, @Body() body: unknown) {
    const parsed = GeneratePlanRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.agentService.generatePlan(
      runId,
      parsed.data.briefContent,
      parsed.data.resolvedAmbiguities
    );
  }

  // ─── POST /api/agent/v1/runs/:runId/proposals ────────────────────────

  @Post('runs/:runId/proposals')
  async proposeChanges(@Param('runId') runId: string, @Body() body: unknown) {
    const parsed = ProposeChangesRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.agentService.proposeChanges(
      runId,
      parsed.data.briefContent,
      parsed.data.plan
    );
  }

  // ─── POST /api/agent/v1/runs/:runId/proposals/:proposalId/preview ────

  @Post('runs/:runId/proposals/:proposalId/preview')
  async preview(
    @Param('runId') runId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: { briefContent: string }
  ) {
    if (!body.briefContent) {
      throw new BadRequestException('briefContent is required');
    }

    return this.agentService.preview(runId, proposalId, body.briefContent);
  }

  // ─── POST /api/agent/v1/runs/:runId/approvals ────────────────────────

  @Post('runs/:runId/approvals')
  async approve(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: unknown
  ) {
    const parsed = ApproveRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const actor = user?.email ?? parsed.data.actor;
    return this.agentService.approve(runId, parsed.data.proposalId, actor);
  }

  // ─── POST /api/agent/v1/runs/:runId/apply ────────────────────────────

  @Post('runs/:runId/apply')
  async apply(@Param('runId') runId: string, @Body() body: unknown) {
    const parsed = ApplyRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.agentService.apply(runId, parsed.data.approvalId);
  }

  // ─── POST /api/agent/v1/runs/:runId/pr ────────────────────────────────

  @Post('runs/:runId/pr')
  async createPR(@Param('runId') runId: string, @Body() body: unknown) {
    const parsed = CreatePRRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.agentService.createPR(
      runId,
      parsed.data.approvalId,
      parsed.data.title,
      parsed.data.body
    );
  }

  // ─── POST /api/agent/v1/runs/:runId/steps/:step — Execute a step ─────

  @Post('runs/:runId/steps/:step')
  async executeStep(
    @Param('runId') runId: string,
    @Param('step') step: string,
    @Body() body: unknown
  ) {
    const stepParsed = AgentStep.safeParse(step);
    if (!stepParsed.success) {
      throw new BadRequestException(
        `Invalid step "${step}". Valid steps: ${AgentStep.options.join(', ')}`
      );
    }

    const bodyParsed = ExecuteStepRequest.safeParse(body);
    if (!bodyParsed.success) {
      throw new BadRequestException(bodyParsed.error.flatten());
    }

    return this.agentService.executeStep(
      stepParsed.data,
      runId,
      bodyParsed.data.briefContent,
      bodyParsed.data.context
    );
  }

  // ─── GET /api/agent/v1/runs/:runId/steps — Get all step results ───────

  @Get('runs/:runId/steps')
  async getStepResults(@Param('runId') runId: string) {
    return this.agentService.getStepResults(runId);
  }

  // ─── GitHub integration endpoints ──────────────────────────────────────

  @Public()
  @Get('github/status')
  getGitHubStatus() {
    return this.agentService.getGitHubStatus();
  }

  @Get('github/repos')
  async listGitHubRepos() {
    return this.agentService.listGitHubRepos();
  }

  @Get('workspaces/:wsId/repos')
  async getWorkspaceRepos(@Param('wsId') wsId: string) {
    return this.agentService.getWorkspaceRepos(wsId);
  }

  @Post('workspaces/:wsId/repos')
  @HttpCode(HttpStatus.CREATED)
  async connectRepo(
    @Param('wsId') wsId: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: unknown
  ) {
    const parsed = ConnectRepoRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const { githubRepoId, fullName, defaultBranch, setAsDefault } = parsed.data;
    return this.agentService.connectRepo(
      wsId,
      githubRepoId,
      fullName,
      defaultBranch,
      user?.email ?? 'unknown',
      setAsDefault
    );
  }

  @Delete('workspaces/:wsId/repos/:id')
  async disconnectRepo(@Param('wsId') wsId: string, @Param('id') id: string) {
    const deleted = await this.agentService.disconnectRepo(wsId, id);
    if (!deleted)
      throw new NotFoundException(`Repo connection ${id} not found`);
    return { ok: true };
  }

  @Patch('workspaces/:wsId/repos/:id/default')
  async setDefaultRepo(@Param('wsId') wsId: string, @Param('id') id: string) {
    await this.agentService.setDefaultRepo(wsId, id);
    return { ok: true };
  }

  // ─── Workspace Rules ────────────────────────────────────────────────────

  @Get('workspaces/:wsId/rules')
  async getWorkspaceRules(@Param('wsId') wsId: string) {
    return this.agentService.getWorkspaceRules(wsId);
  }

  @Post('workspaces/:wsId/rules')
  @HttpCode(HttpStatus.CREATED)
  async addRule(
    @Param('wsId') wsId: string,
    @Body() body: { docId: string; docTitle?: string }
  ) {
    if (!body.docId?.trim()) {
      throw new BadRequestException('docId is required');
    }
    return this.agentService.addRule(
      wsId,
      body.docId.trim(),
      body.docTitle?.trim()
    );
  }

  @Delete('workspaces/:wsId/rules/:ruleId')
  async removeRule(
    @Param('wsId') wsId: string,
    @Param('ruleId') ruleId: string
  ) {
    const deleted = await this.agentService.removeRule(wsId, ruleId);
    if (!deleted) throw new NotFoundException(`Rule ${ruleId} not found`);
    return { ok: true };
  }

  // ─── GET /api/agent/v1/repo/changes/:workspaceId ────────────────────────

  @Get('repo/changes/:workspaceId')
  async getRepoChanges(
    @Param('workspaceId') workspaceId: string,
    @Query('docId') docId?: string
  ) {
    return this.agentService.getRepoChanges(workspaceId, docId);
  }

  // ─── POST /api/agent/v1/repo/commit/:workspaceId ──────────────────────

  @Post('repo/commit/:workspaceId')
  async commitRepo(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { message: string }
  ) {
    if (!body.message?.trim()) {
      throw new BadRequestException('message is required');
    }
    return this.agentService.commitRepoChanges(
      workspaceId,
      body.message.trim()
    );
  }

  // ─── POST /api/agent/v1/chat — Interactive chat with persistence ─────

  @Post('chat')
  async chat(
    @CurrentUser() user: CurrentUserType,
    @Body()
    body: {
      message: string;
      workspaceId?: string;
      docId?: string;
      runId?: string;
      sessionId?: string;
      cwd?: string;
      documentContent?: string;
    }
  ) {
    if (!body.message) {
      throw new BadRequestException('message is required');
    }

    try {
      // Resolve Claude session ID from persisted chat session
      let claudeSessionId = body.sessionId;
      let chatSessionId: string | undefined;

      if (body.workspaceId && body.docId) {
        const chatSession = await this.storage.getOrCreateChatSession(
          body.workspaceId,
          body.docId
        );
        chatSessionId = chatSession.id;
        claudeSessionId =
          claudeSessionId ?? chatSession.claudeSessionId ?? undefined;

        // Persist user message
        await this.storage.addChatMessage(chatSession.id, 'user', body.message);
      }

      // Resolve repo cwd: explicit cwd > workspace default repo > process.cwd()
      let repoCwd = body.cwd;
      if (!repoCwd && body.workspaceId) {
        const repoTarget = await this.agentService.getWorkspaceRepoTarget(
          body.workspaceId
        );
        if (repoTarget?.localPath) {
          repoCwd = repoTarget.localPath;
          // Ensure we're on the correct branch for this doc
          if (body.docId) {
            const branch = await this.agentService.ensureDocBranch(
              body.workspaceId,
              body.docId
            );
            this.logger.log(`Chat on branch ${branch}, cwd: ${repoCwd}`);
          }
        }
      }

      // Load project rules from docs + repo
      const projectRules = body.workspaceId
        ? await this.agentService.loadProjectRules(body.workspaceId)
        : null;

      if (projectRules) {
        this.logger.log(
          `[chat] Loaded project rules (${projectRules.length} chars) for workspace ${body.workspaceId}`
        );
        this.logger.debug(
          `[chat] Rules content:\n${projectRules.substring(0, 500)}${projectRules.length > 500 ? '...' : ''}`
        );
      } else {
        this.logger.log(
          `[chat] No project rules found for workspace ${body.workspaceId ?? 'none'}`
        );
      }

      const result = await this.claudeCode.chat(body.message, {
        sessionId: claudeSessionId,
        cwd: repoCwd,
        systemPrompt: await this.buildSystemPrompt(
          body.documentContent,
          projectRules
        ),
        allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash(git:*)'],
        timeoutMs: 10 * 60 * 1000, // 10 min — chat with tools needs more time
      });

      // Persist assistant reply and Claude session ID
      if (chatSessionId) {
        await this.storage.addChatMessage(
          chatSessionId,
          'assistant',
          result.text
        );
        if (result.sessionId) {
          await this.storage.updateChatSessionClaudeId(
            chatSessionId,
            result.sessionId
          );
        }
      }

      return result;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`POST /chat error: ${msg}`, (err as Error).stack);
      throw new BadRequestException(`Chat failed: ${msg}`);
    }
  }

  // ─── GET /api/agent/v1/chat/history/:workspaceId/:docId ───────────────

  @Get('chat/history/:workspaceId/:docId')
  async getChatHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string
  ) {
    const session = await this.storage.getOrCreateChatSession(
      workspaceId,
      docId
    );
    const messages = await this.storage.getChatMessages(session.id);
    return {
      sessionId: session.claudeSessionId,
      messages,
    };
  }

  // ─── DELETE /api/agent/v1/chat/history/:workspaceId/:docId ─────────────

  @Delete('chat/history/:workspaceId/:docId')
  async clearChatHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('docId') docId: string
  ) {
    await this.storage.deleteChatSession(workspaceId, docId);
    return { ok: true };
  }

  // ─── POST /api/agent/v1/chat/apply-edit — Apply suggested edit to doc ──

  @Post('chat/apply-edit')
  async applyEdit(
    @Body()
    body: {
      workspaceId: string;
      docId: string;
      original: string;
      replacement: string;
      documentContent?: string;
    }
  ) {
    if (
      !body.workspaceId ||
      !body.docId ||
      !body.original ||
      body.replacement == null
    ) {
      throw new BadRequestException(
        'workspaceId, docId, original, and replacement are required'
      );
    }

    try {
      const result = await this.agentService.applyChatEdit(
        body.workspaceId,
        body.docId,
        body.original,
        body.replacement,
        body.documentContent
      );

      return result;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(
        `POST /chat/apply-edit error: ${msg}`,
        (err as Error).stack
      );
      return { ok: false, error: `Apply edit failed: ${msg}` };
    }
  }

  // ─── POST /api/agent/v1/chat/stream — SSE streaming chat ─────────────

  @Post('chat/stream')
  @Sse()
  chatStream(
    @Body()
    body: {
      message: string;
      workspaceId?: string;
      docId?: string;
      sessionId?: string;
      cwd?: string;
      documentContent?: string;
    }
  ): Observable<SseMessage> {
    if (!body.message) {
      throw new BadRequestException('message is required');
    }

    const subject$ = new Subject<SseMessage>();

    // Resolve session + repo cwd async, then start streaming
    const startStream = async () => {
      let claudeSessionId = body.sessionId;
      let chatSessionId: string | undefined;

      if (body.workspaceId && body.docId) {
        const chatSession = await this.storage.getOrCreateChatSession(
          body.workspaceId,
          body.docId
        );
        chatSessionId = chatSession.id;
        claudeSessionId =
          claudeSessionId ?? chatSession.claudeSessionId ?? undefined;

        // Persist user message
        await this.storage.addChatMessage(chatSession.id, 'user', body.message);
      }

      let cwd = body.cwd;
      if (!cwd && body.workspaceId) {
        const repoTarget = await this.agentService.getWorkspaceRepoTarget(
          body.workspaceId
        );
        if (repoTarget?.localPath) cwd = repoTarget.localPath;
      }
      return { cwd, claudeSessionId, chatSessionId };
    };

    startStream()
      .then(async ({ cwd, claudeSessionId, chatSessionId }) => {
        const projectRules = body.workspaceId
          ? await this.agentService.loadProjectRules(body.workspaceId)
          : null;

        if (projectRules) {
          this.logger.log(
            `[stream] Loaded project rules (${projectRules.length} chars) for workspace ${body.workspaceId}`
          );
          this.logger.debug(
            `[stream] Rules content:\n${projectRules.substring(0, 500)}${projectRules.length > 500 ? '...' : ''}`
          );
        } else {
          this.logger.log(
            `[stream] No project rules found for workspace ${body.workspaceId ?? 'none'}`
          );
        }

        this.claudeCode
          .chatStream(
            body.message,
            {
              sessionId: claudeSessionId,
              cwd,
              systemPrompt: await this.buildSystemPrompt(
                body.documentContent,
                projectRules
              ),
              allowedTools: [
                'Read',
                'Glob',
                'Grep',
                'Edit',
                'Write',
                'Bash(git:*)',
              ],
            },
            chunk => {
              subject$.next({ data: JSON.stringify(chunk) });
            }
          )
          .then(async final => {
            // Persist assistant reply and Claude session ID
            if (chatSessionId) {
              await this.storage.addChatMessage(
                chatSessionId,
                'assistant',
                final.text
              );
              if (final.sessionId) {
                await this.storage.updateChatSessionClaudeId(
                  chatSessionId,
                  final.sessionId
                );
              }
            }
            subject$.next({ data: JSON.stringify({ type: 'done', ...final }) });
            subject$.complete();
          })
          .catch(err => {
            subject$.next({
              data: JSON.stringify({
                type: 'error',
                message: (err as Error).message,
              }),
            });
            subject$.complete();
          });
      })
      .catch(err => {
        subject$.next({
          data: JSON.stringify({
            type: 'error',
            message: (err as Error).message,
          }),
        });
        subject$.complete();
      });

    return subject$.asObservable();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async buildSystemPrompt(
    documentContent?: string,
    projectRules?: string | null
  ): Promise<string> {
    const editInstructions = [
      'EDICIONES AL DOCUMENTO:',
      'Cuando el usuario te pida mejorar, reescribir, editar o llenar secciones del documento, ' +
        'usa el siguiente formato especial para que la interfaz pueda aplicar los cambios directamente:',
      '',
      ':::edit',
      'ORIGINAL:',
      '<texto EXACTO tal como aparece en el documento actual>',
      '---',
      'REPLACEMENT:',
      '<texto nuevo que reemplazará al original>',
      ':::',
      '',
      'REGLAS CRÍTICAS:',
      '- ORIGINAL debe ser una copia EXACTA del texto que está en el documento (la sección "CURRENT DOCUMENT" de abajo).',
      '- NUNCA uses como ORIGINAL texto que el usuario escribió en el chat — siempre usa el texto del DOCUMENTO.',
      '- Puedes incluir múltiples bloques :::edit en una misma respuesta.',
      '- Agrega explicaciones fuera de los bloques :::edit.',
      '',
      'CASO TEMPLATE (documento con placeholders):',
      'Si el documento tiene texto placeholder entre corchetes como [¿Qué capacidad...?] o [Impacto medible 1],',
      'y el usuario te envía contenido para llenar esas secciones:',
      '- El ORIGINAL debe ser el texto placeholder TAL COMO APARECE en el documento.',
      '- El REPLACEMENT debe ser el contenido final (mejorado si el usuario lo pidió).',
      '',
      'Ejemplo — si el documento tiene:',
      '> [¿Qué capacidad estratégica nueva habilita esto?]',
      'Y el usuario envía "Permitir análisis por holding empresarial", entonces:',
      '',
      ':::edit',
      'ORIGINAL:',
      '[¿Qué capacidad estratégica nueva habilita esto?]',
      '---',
      'REPLACEMENT:',
      'Permitir análisis por holding empresarial.',
      ':::',
      '',
      'Si hay varias líneas placeholder consecutivas (como [Impacto 1], [Impacto 2], etc.),',
      'inclúyelas TODAS como un solo bloque ORIGINAL y reemplázalas con el contenido real.',
    ].join('\n');

    const base =
      `Eres un asistente de IA integrado en AION, un editor de documentos colaborativo basado en AFFiNE. ` +
      `SIEMPRE responde en español. ` +
      `El usuario está chateando contigo desde la barra lateral de un documento. ` +
      `Responde preguntas sobre el documento, ayuda a analizarlo, sugiere mejoras o ayuda con tareas relacionadas. ` +
      `Sé conciso y útil. ` +
      `Tienes acceso al repositorio del proyecto — usa las herramientas Read, Glob y Grep para explorar el código cuando necesites contexto. ` +
      `Cuando propongas cambios al código, asegúrate de leer los archivos relevantes primero para entender el contexto actual.` +
      `\n\n${editInstructions}`;

    let prompt = base;

    if (projectRules) {
      prompt += `\n\n=== PROJECT RULES ===\nLas siguientes reglas del proyecto DEBEN respetarse siempre. Fueron definidas por el equipo en documentos AFFiNE y/o archivos del repo (AION.md, .aion/rules/*.md):\n\n${projectRules}\n=== END RULES ===`;
    }

    if (documentContent) {
      prompt += `\n\n=== CURRENT DOCUMENT (Markdown) ===\n${documentContent}\n=== END DOCUMENT ===`;
    }

    return prompt;
  }
}
