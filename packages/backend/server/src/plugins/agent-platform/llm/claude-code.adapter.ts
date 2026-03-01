/**
 * Claude Code CLI Adapter
 *
 * Wraps `claude` CLI with:
 *  - --print mode for non-interactive use
 *  - --output-format stream-json for real-time streaming
 *  - --json-schema for structured output
 *  - --resume for multi-turn sessions
 *  - Proper timeouts and error handling
 */
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type {
  AgentStep,
  Ambiguity,
  ClaudeCodeAnalysisOutput,
  Plan,
} from '@aion/agent-contracts';

export interface ClaudeCodeOptions {
  cwd?: string;
  sessionId?: string;
  model?: string;
  maxBudget?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  allowedTools?: string[];
}

export interface ClaudeCodeResult {
  output: ClaudeCodeAnalysisOutput;
  sessionId?: string;
  rawText?: string;
  costUsd?: number;
}

export interface ChatResult {
  text: string;
  sessionId?: string;
  costUsd?: number;
}

/** JSON Schema for structured analysis output */
const ANALYSIS_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    ambiguities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'med', 'high'] },
          context: { type: 'string' },
        },
        required: ['id', 'question', 'severity'],
      },
    },
    plan: {
      type: ['object', 'null'],
      properties: {
        epics: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } }, required: ['id', 'title', 'description'] } },
        tasks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, epicId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] } }, required: ['id', 'title', 'description'] } },
        checkpoints: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, afterTaskIds: { type: 'array', items: { type: 'string' } } }, required: ['id', 'title', 'afterTaskIds'] } },
        summary: { type: 'string' },
      },
      required: ['epics', 'tasks', 'checkpoints'],
    },
    briefEdits: { type: 'array', items: { type: 'object', properties: { rangeHint: { type: 'string' }, markdown: { type: 'string' }, reason: { type: 'string' } }, required: ['rangeHint', 'markdown'] } },
    repoPatches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, type: { type: 'string', enum: ['create', 'update', 'delete'] }, content: { type: 'string' }, reason: { type: 'string' } }, required: ['path', 'type', 'content'] } },
    notes: { type: 'string' },
  },
  required: ['ambiguities', 'plan', 'briefEdits', 'repoPatches'],
});

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ─── Per-step JSON schemas ──────────────────────────────────────────────────

const STEP_SCHEMAS: Record<string, string> = {
  validate_brief: JSON.stringify({
    type: 'object',
    properties: {
      isExecutable: { type: 'boolean' },
      ambiguityLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      missingElements: { type: 'array', items: { type: 'string' } },
      clarificationQuestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['isExecutable', 'ambiguityLevel', 'missingElements', 'clarificationQuestions'],
  }),
  detect_ambiguity: JSON.stringify({
    type: 'object',
    properties: {
      conceptualAmbiguities: { type: 'array', items: { type: 'string' } },
      technicalAmbiguities: { type: 'array', items: { type: 'string' } },
      operationalAmbiguities: { type: 'array', items: { type: 'string' } },
      riskIfExecutedAsIs: { type: 'string' },
    },
    required: ['conceptualAmbiguities', 'technicalAmbiguities', 'operationalAmbiguities', 'riskIfExecutedAsIs'],
  }),
  technical_plan: JSON.stringify({
    type: 'object',
    properties: {
      architectureImpact: { type: 'string' },
      dataModelChanges: { type: 'array', items: { type: 'string' } },
      apiChanges: { type: 'array', items: { type: 'string' } },
      uiChanges: { type: 'array', items: { type: 'string' } },
      performanceConsiderations: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      rollbackCost: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    },
    required: ['architectureImpact', 'dataModelChanges', 'apiChanges', 'uiChanges', 'performanceConsiderations', 'risks', 'rollbackCost'],
  }),
  brief_epics: JSON.stringify({
    type: 'object',
    properties: {
      epics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            epicId: { type: 'string' },
            title: { type: 'string' },
            area: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['epicId', 'title', 'area', 'description'],
        },
      },
    },
    required: ['epics'],
  }),
  generate_tasks: JSON.stringify({
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            title: { type: 'string' },
            type: { type: 'string', enum: ['feature', 'bug', 'chore', 'refactor', 'test', 'docs'] },
            description: { type: 'string' },
            acceptanceCriteria: { type: 'array', items: { type: 'string' } },
          },
          required: ['taskId', 'title', 'type', 'description', 'acceptanceCriteria'],
        },
      },
    },
    required: ['tasks'],
  }),
  generate_checkpoints: JSON.stringify({
    type: 'object',
    properties: {
      checkpoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            checkpoint: { type: 'string' },
            visibleOutcome: { type: 'string' },
            howToValidate: { type: 'string' },
          },
          required: ['checkpoint', 'visibleOutcome', 'howToValidate'],
        },
      },
    },
    required: ['checkpoints'],
  }),
  code_generation: JSON.stringify({
    type: 'object',
    properties: {
      assumptions: { type: 'array', items: { type: 'string' } },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['assumptions', 'files'],
  }),
  check_alignment: JSON.stringify({
    type: 'object',
    properties: {
      aligned: { type: 'boolean' },
      deviations: { type: 'array', items: { type: 'string' } },
      missingFromImplementation: { type: 'array', items: { type: 'string' } },
      unexpectedAdditions: { type: 'array', items: { type: 'string' } },
      overallAssessment: { type: 'string' },
    },
    required: ['aligned', 'deviations', 'missingFromImplementation', 'unexpectedAdditions', 'overallAssessment'],
  }),
};

const STEP_PROMPTS: Record<string, string> = {
  validate_brief: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es VALIDAR un brief de proyecto. Determina si el brief es ejecutable tal como está. Evalúa el nivel de ambigüedad (LOW/MEDIUM/HIGH). Lista los elementos faltantes (ej. criterios de éxito, límites de alcance, restricciones técnicas). Genera preguntas de clarificación que el autor debería responder antes de proceder. Sé exhaustivo pero práctico.`,

  detect_ambiguity: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es DETECTAR AMBIGÜEDADES en un brief de proyecto. Categoriza las ambigüedades en tres grupos:
- Conceptuales: objetivos poco claros, requisitos contradictorios, criterios de éxito vagos
- Técnicas: decisiones de stack tecnológico sin definir, detalles de integración faltantes, modelos de datos poco claros
- Operativas: plazos desconocidos, restricciones de recursos, incógnitas de despliegue
También evalúa el riesgo si el brief se ejecutara tal como está sin resolver estas ambigüedades.`,

  technical_plan: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es generar un PLAN TÉCNICO a partir de un brief de proyecto. Evalúa: impacto en la arquitectura, cambios en el modelo de datos, cambios en APIs, cambios en UI, consideraciones de rendimiento, riesgos y costo de rollback (LOW/MEDIUM/HIGH). Sé específico y accionable — referencia sistemas y componentes concretos cuando sea posible.`,

  brief_epics: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es descomponer un brief de proyecto en ÉPICAS. Cada épica debe tener un epicId único, título, área (ej. "frontend", "backend", "infra", "data") y descripción. Las épicas representan bloques de trabajo entregables de alto nivel. Mantenlas de grano grueso — típicamente 3-7 épicas por brief.`,

  generate_tasks: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es generar TAREAS a partir de un brief de proyecto y sus épicas. Cada tarea debe tener: taskId, título, tipo (feature/bug/chore/refactor/test/docs), descripción y acceptanceCriteria (lista de criterios concretos y verificables). Las tareas deben ser lo suficientemente específicas para que un desarrollador pueda comenzar a trabajar de inmediato.`,

  generate_checkpoints: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es generar CHECKPOINTS (hitos) para un proyecto. Cada checkpoint debe tener: un nombre, un visibleOutcome (lo que el usuario/stakeholder puede ver o verificar) y howToValidate (pasos concretos para confirmar que el checkpoint se alcanzó). Los checkpoints deben estar ordenados y representar puntos de control de progreso significativos.`,

  code_generation: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español (los comentarios en el código pueden ser en inglés). Tu tarea es GENERAR CÓDIGO para una tarea específica de un brief de proyecto. Lista tus suposiciones explícitamente. Para cada archivo, proporciona la ruta completa y el contenido completo. Sigue las convenciones existentes del proyecto. NO modifiques archivos .env, .pem, id_rsa, secretos, node_modules, dist o build. Si falta información, indícalo como una suposición en lugar de adivinar.`,

  check_alignment: `Eres AION, un agente de IA integrado en un editor de documentos colaborativo. SIEMPRE responde en español. Tu tarea es VERIFICAR LA ALINEACIÓN entre el brief original y la implementación producida hasta ahora. Determina si la implementación está alineada con el brief. Lista desviaciones, cosas faltantes en la implementación y adiciones inesperadas. Proporciona una evaluación general resumiendo el estado de alineación.`,
};

export interface StepExecutionResult<T = unknown> {
  result: T;
  sessionId?: string;
}

@Injectable()
export class ClaudeCodeAdapter {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private claudePath: string | null = null;

  /**
   * Check if claude CLI is available and cache path.
   */
  async isAvailable(): Promise<boolean> {
    if (this.claudePath) return true;
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const { stdout } = await exec('which', ['claude']);
      this.claudePath = stdout.trim();
      return true;
    } catch {
      this.logger.warn('Claude Code CLI not found in PATH');
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const { stdout } = await exec('claude', ['--version']);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  // ─── Generic step execution ──────────────────────────────────────────

  async executeStep<T = unknown>(
    step: AgentStep,
    prompt: string,
    options: ClaudeCodeOptions = {}
  ): Promise<StepExecutionResult<T>> {
    const schema = STEP_SCHEMAS[step];
    const systemPrompt = STEP_PROMPTS[step];
    if (!schema || !systemPrompt) {
      throw new Error(`Unknown agent step: ${step}`);
    }

    const raw = await this.invokeWithSchema(
      prompt,
      systemPrompt,
      schema,
      options
    );

    return {
      result: raw.result as T,
      sessionId: raw.sessionId,
    };
  }

  // ─── Structured analysis (--json-schema) ──────────────────────────────

  async analyzeAmbiguity(
    briefContent: string,
    options: ClaudeCodeOptions = {}
  ): Promise<{ ambiguities: Ambiguity[]; sessionId?: string }> {
    const systemPrompt = `You are an expert brief analyzer. Analyze the following brief document and identify ambiguities, missing information, unclear requirements, and assumptions that need validation. For each issue found, assign a severity (low/med/high). If the brief is clear and complete, return an empty ambiguities array. Do NOT invent information. Return plan as null, briefEdits as empty array, repoPatches as empty array.`;

    const result = await this.invokeStructured(
      `Analyze this brief for ambiguities:\n\n${briefContent}`,
      systemPrompt,
      options
    );

    return { ambiguities: result.output.ambiguities, sessionId: result.sessionId };
  }

  async generatePlan(
    briefContent: string,
    resolvedAmbiguities?: Array<{ id: string; answer: string }>,
    options: ClaudeCodeOptions = {}
  ): Promise<{ plan: Plan; sessionId?: string }> {
    const ctx = resolvedAmbiguities?.length
      ? `\n\nResolved ambiguities:\n${resolvedAmbiguities.map(a => `- ${a.id}: ${a.answer}`).join('\n')}`
      : '';

    const systemPrompt = `You are a technical architect. Generate a structured implementation plan from the brief. Break it into epics (high-level goals), tasks (concrete implementation steps), and checkpoints (milestones). Return ambiguities as empty array, briefEdits as empty array, repoPatches as empty array.`;

    const result = await this.invokeStructured(
      `Generate a technical plan for this brief:${ctx}\n\n${briefContent}`,
      systemPrompt,
      options
    );

    if (!result.output.plan) throw new Error('Claude Code did not return a plan');
    return { plan: result.output.plan, sessionId: result.sessionId };
  }

  async proposeChanges(
    briefContent: string,
    plan?: Plan,
    options: ClaudeCodeOptions = {}
  ): Promise<ClaudeCodeAnalysisOutput & { sessionId?: string }> {
    const planCtx = plan ? `\n\nApproved plan:\n${JSON.stringify(plan, null, 2)}` : '';
    const systemPrompt = `You are a senior engineer. Based on the brief and plan, propose concrete changes:
1. briefEdits: improvements to the brief document itself
2. repoPatches: actual code files to create or update
Rules: NEVER modify .env, .pem, id_rsa, secrets, node_modules, dist, or build files. If information is missing, add to ambiguities instead of guessing.`;

    const result = await this.invokeStructured(
      `Propose changes for this brief:${planCtx}\n\n${briefContent}`,
      systemPrompt,
      options
    );

    return { ...result.output, sessionId: result.sessionId };
  }

  // ─── Free-form chat (no json-schema) ──────────────────────────────────

  async chat(
    message: string,
    options: ClaudeCodeOptions = {}
  ): Promise<ChatResult> {
    const args = this.buildChatArgs(options);
    this.logger.log(`Chat args: cwd=${options.cwd ?? 'default'}, allowedTools=${options.allowedTools?.join(',') ?? 'none'}`);
    const { stdout, stderr, exitCode } = await this.spawnClaude(
      args,
      message,
      options.cwd,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    if (exitCode !== 0) {
      throw new Error(`Claude Code chat failed (exit ${exitCode}): ${stderr.slice(0, 500)}`);
    }

    // --output-format json wraps the result
    try {
      const parsed = JSON.parse(stdout);
      return {
        text: typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result),
        sessionId: parsed.session_id,
        costUsd: parsed.cost_usd,
      };
    } catch {
      return { text: stdout };
    }
  }

  /**
   * Chat with streaming — calls onChunk for each line of output.
   */
  async chatStream(
    message: string,
    options: ClaudeCodeOptions = {},
    onChunk: (chunk: { type: string; content?: string }) => void
  ): Promise<ChatResult> {
    const args = this.buildStreamArgs(options);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.claudePath ?? 'claude', args, {
        cwd: options.cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let fullText = '';
      let sessionId: string | undefined;

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'assistant' && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === 'text') {
                  fullText += block.text;
                  onChunk({ type: 'text', content: block.text });
                }
              }
            }
            if (parsed.type === 'result') {
              sessionId = parsed.session_id;
              if (parsed.result) {
                fullText = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
              }
            }
          } catch {
            // Non-JSON line, treat as raw text
            fullText += line;
            onChunk({ type: 'text', content: line });
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        this.logger.debug(`Claude stderr: ${chunk.toString().slice(0, 200)}`);
      });

      proc.stdin.write(message);
      proc.stdin.end();

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Claude Code stream timed out'));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
          reject(new Error(`Claude Code stream exited with code ${code}`));
        } else {
          resolve({ text: fullText, sessionId });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });
    });
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Generic structured invocation — accepts any JSON schema string.
   * Returns the raw parsed result (not typed to ClaudeCodeAnalysisOutput).
   */
  private async invokeWithSchema(
    prompt: string,
    systemPrompt: string,
    jsonSchema: string,
    options: ClaudeCodeOptions
  ): Promise<{ result: unknown; sessionId?: string }> {
    if (!(await this.isAvailable())) {
      throw new Error(
        'Claude Code CLI is not installed. Install with: npm install -g @anthropic-ai/claude-code'
      );
    }

    const args = [
      '--print',
      '--output-format', 'json',
      '--json-schema', jsonSchema,
      '--system-prompt', systemPrompt,
      '--no-session-persistence',
    ];

    if (options.model) args.push('--model', options.model);
    if (options.sessionId) args.push('--resume', options.sessionId);
    if (options.maxBudget) args.push('--max-budget-usd', String(options.maxBudget));

    this.logger.log(`Invoking Claude Code structured: cwd=${options.cwd ?? 'default'}, schema_length=${jsonSchema.length}`);
    this.logger.debug(`Prompt (first 200 chars): ${prompt.slice(0, 200)}`);

    const { stdout, stderr, exitCode } = await this.spawnClaude(
      args,
      prompt,
      options.cwd,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    // Log full stdout if under 2KB, otherwise truncate
    if (stdout.length <= 2000) {
      this.logger.log(`Claude Code raw stdout (${stdout.length} chars): ${stdout}`);
    } else {
      this.logger.log(`Claude Code raw stdout (${stdout.length} chars, truncated): ${stdout.slice(0, 1000)}...`);
    }
    if (stderr) {
      this.logger.debug(`Claude Code stderr (first 300 chars): ${stderr.slice(0, 300)}`);
    }

    if (exitCode !== 0) {
      this.logger.error(`Claude Code failed (exit ${exitCode}): ${stderr.slice(0, 500)}`);
      throw new Error(`Claude Code failed (exit ${exitCode}): ${stderr.slice(0, 500)}`);
    }

    const parsed = this.parseGenericOutput(stdout);
    this.logger.debug(`Parsed result keys: ${typeof parsed.result === 'object' && parsed.result ? Object.keys(parsed.result as object).join(', ') : typeof parsed.result}`);
    return parsed;
  }

  private async invokeStructured(
    prompt: string,
    systemPrompt: string,
    options: ClaudeCodeOptions
  ): Promise<ClaudeCodeResult> {
    const raw = await this.invokeWithSchema(prompt, systemPrompt, ANALYSIS_JSON_SCHEMA, options);
    // Coerce to legacy ClaudeCodeAnalysisOutput shape
    const content = raw.result as any;
    const output: ClaudeCodeAnalysisOutput = {
      ambiguities: content.ambiguities ?? [],
      plan: content.plan ?? null,
      briefEdits: content.briefEdits ?? [],
      repoPatches: content.repoPatches ?? [],
      notes: content.notes,
    };
    return { output, sessionId: raw.sessionId };
  }

  private buildChatArgs(options: ClaudeCodeOptions): string[] {
    const args = ['--print', '--output-format', 'json'];
    if (options.model) args.push('--model', options.model);
    if (options.sessionId) args.push('--resume', options.sessionId);
    if (options.maxBudget) args.push('--max-budget-usd', String(options.maxBudget));
    if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt);
    if (options.allowedTools?.length) {
      args.push('--allowedTools', ...options.allowedTools);
    }
    return args;
  }

  private buildStreamArgs(options: ClaudeCodeOptions): string[] {
    const args = ['--print', '--output-format', 'stream-json'];
    if (options.model) args.push('--model', options.model);
    if (options.sessionId) args.push('--resume', options.sessionId);
    if (options.maxBudget) args.push('--max-budget-usd', String(options.maxBudget));
    if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt);
    if (options.allowedTools?.length) {
      args.push('--allowedTools', ...options.allowedTools);
    }
    return args;
  }

  private spawnClaude(
    args: string[],
    prompt: string,
    cwd?: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.claudePath ?? 'claude', args, {
        cwd: cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.stdin.write(prompt);
      proc.stdin.end();

      const timeout = setTimeout(() => {
        this.logger.warn(`Claude Code timed out after ${timeoutMs}ms, killing process`);
        proc.kill('SIGTERM');
        // Give it 5s to die gracefully, then SIGKILL
        setTimeout(() => proc.kill('SIGKILL'), 5000);
        resolve({ stdout, stderr: stderr + '\nProcess timed out', exitCode: 124 });
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });
    });
  }

  /**
   * Generic output parser — returns the raw result without assuming a specific shape.
   *
   * Claude Code `--output-format json` returns:
   *   { type: "result", result: <text>, structured_output?: <object>, session_id: "...", ... }
   *
   * When `--json-schema` is used, the validated structured data is in
   * `structured_output` (object), while `result` still contains the text response.
   * We check structured_output first, then fall back to parsing result.
   */
  private parseGenericOutput(stdout: string): { result: unknown; sessionId?: string } {
    try {
      // Strip any leading/trailing whitespace and BOM
      const cleanStdout = stdout.replace(/^\uFEFF/, '').trim();

      // stdout may contain multiple JSON lines (status messages before the result).
      // The result line has "type":"result". Find and parse that line.
      let parsed: any;
      const lines = cleanStdout.split('\n');

      this.logger.debug(`parseGenericOutput: ${lines.length} lines in stdout`);

      // Try to find the result line (search backwards — result is usually last)
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line || !line.startsWith('{')) continue;
        try {
          const candidate = JSON.parse(line);
          if (candidate.type === 'result') {
            parsed = candidate;
            this.logger.debug(`parseGenericOutput: found result at line ${i}`);
            break;
          }
        } catch {
          // not a JSON line, skip
        }
      }

      // Fallback: parse entire stdout as single JSON
      if (!parsed) {
        try {
          parsed = JSON.parse(cleanStdout);
        } catch {
          // Last resort: try to find any JSON object with a result field
          const match = cleanStdout.match(/\{[^]*"type"\s*:\s*"result"[^]*\}/);
          if (match) {
            parsed = JSON.parse(match[0]);
          } else {
            throw new Error('No result JSON found in output');
          }
        }
      }

      this.logger.log(
        `parseGenericOutput: type=${parsed.type}, subtype=${parsed.subtype}, ` +
        `has_structured_output=${parsed.structured_output !== undefined}, ` +
        `result_type=${typeof parsed.result}, ` +
        `result_preview=${JSON.stringify(parsed.result).slice(0, 200)}`
      );

      let result: unknown;

      // Priority 1: Use structured_output if available (from --json-schema)
      // The SDK returns validated JSON in structured_output, not in result.
      if (parsed.structured_output !== undefined && parsed.structured_output !== null) {
        if (typeof parsed.structured_output === 'object') {
          result = parsed.structured_output;
          this.logger.log('parseGenericOutput: using structured_output (object)');
        } else if (typeof parsed.structured_output === 'string') {
          try {
            result = JSON.parse(parsed.structured_output);
            this.logger.log('parseGenericOutput: parsed structured_output string as JSON');
          } catch {
            this.logger.warn('parseGenericOutput: structured_output is non-JSON string');
            result = { _rawText: parsed.structured_output };
          }
        } else {
          this.logger.warn(`parseGenericOutput: unexpected structured_output type: ${typeof parsed.structured_output}`);
          result = parsed.structured_output;
        }
      }
      // Priority 2: Fall back to result field
      else {
        const resultField = parsed.result;
        const resultType = typeof resultField;

        if (resultType === 'string') {
          const text = resultField as string;

          // Try direct JSON parse first
          try {
            result = JSON.parse(text);
            this.logger.debug('parseGenericOutput: parsed result string as JSON');
          } catch {
            // Try stripping markdown code fences
            const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
            if (fenceMatch) {
              try {
                result = JSON.parse(fenceMatch[1].trim());
                this.logger.debug('parseGenericOutput: parsed JSON from markdown fence');
              } catch {
                // Fall through
              }
            }

            if (!result) {
              // Try to extract the outermost JSON object
              const jsonStart = text.indexOf('{');
              const jsonEnd = text.lastIndexOf('}');
              if (jsonStart !== -1 && jsonEnd > jsonStart) {
                try {
                  result = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
                  this.logger.debug('parseGenericOutput: extracted JSON from text');
                } catch {
                  this.logger.warn(`parseGenericOutput: failed to extract JSON from text (${text.length} chars)`);
                }
              }
            }

            if (!result) {
              this.logger.warn(`parseGenericOutput: result is non-JSON text: ${text.slice(0, 200)}`);
              result = { _rawText: text };
            }
          }
        } else if (resultType === 'object' && resultField !== null) {
          result = resultField;
          this.logger.debug('parseGenericOutput: result is already an object');
        } else {
          this.logger.warn(`parseGenericOutput: unexpected result type: ${resultType}`);
          result = {};
        }
      }

      // Log final result keys for debugging
      const resultKeys = typeof result === 'object' && result
        ? Object.keys(result as object)
        : [];
      this.logger.log(
        `parseGenericOutput final: keys=[${resultKeys.join(', ')}], ` +
        `hasRawText=${'_rawText' in (result as any || {})}`
      );

      return { result, sessionId: parsed.session_id };
    } catch (err) {
      this.logger.error(`Failed to parse Claude output (${stdout.length} chars): ${stdout.slice(0, 500)}`);
      throw new Error(`Failed to parse Claude Code JSON: ${(err as Error).message}`);
    }
  }
}
