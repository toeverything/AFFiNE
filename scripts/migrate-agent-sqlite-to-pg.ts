#!/usr/bin/env npx ts-node
/**
 * One-time migration: Agent Platform SQLite → PostgreSQL
 *
 * Usage:
 *   cd packages/backend/server
 *   npx ts-node ../../../scripts/migrate-agent-sqlite-to-pg.ts [path/to/agent-platform.db]
 *
 * Requires:
 *   - DATABASE_URL env var pointing to the PostgreSQL database
 *   - The Prisma migration already applied (agent_platform tables exist)
 *   - better-sqlite3 installed (npm i -g better-sqlite3 or use from node_modules)
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

const DB_PATH = process.argv[2] || resolve(process.cwd(), 'agent-platform.db');

async function main() {
  console.log(`\n📦 SQLite source: ${DB_PATH}`);

  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.pragma('journal_mode = WAL');

  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('✅ Connected to PostgreSQL\n');

  // ── Helper ──────────────────────────────────────────────────────────
  const isoToDate = (iso: string | null): Date | null =>
    iso ? new Date(iso) : null;

  let total = 0;

  // ── 1. runs → agent_runs ──────────────────────────────────────────
  const runs = sqlite.prepare('SELECT * FROM runs').all() as any[];
  console.log(`Migrating ${runs.length} runs...`);
  for (const r of runs) {
    await prisma.agentRun.upsert({
      where: { runId: r.run_id },
      create: {
        runId: r.run_id,
        status: r.status,
        workspaceId: r.workspace_id,
        docId: r.doc_id,
        fingerprint: r.fingerprint,
        repoId: r.repo_id,
        repoLocalPath: r.repo_local_path,
        repoRemoteUrl: r.repo_remote_url,
        repoDefaultBranch: r.repo_default_branch,
        claudeSessionId: r.claude_session_id,
        branchName: r.branch_name,
        error: r.error,
        createdAt: isoToDate(r.created_at)!,
        updatedAt: isoToDate(r.updated_at)!,
      },
      update: {},
    });
  }
  total += runs.length;

  // ── 2. proposals → agent_proposals ────────────────────────────────
  const proposals = sqlite.prepare('SELECT * FROM proposals').all() as any[];
  console.log(`Migrating ${proposals.length} proposals...`);
  for (const p of proposals) {
    await prisma.agentProposal.upsert({
      where: { proposalId: p.proposal_id },
      create: {
        proposalId: p.proposal_id,
        runId: p.run_id,
        ambiguities: JSON.parse(p.ambiguities_json || '[]'),
        plan: p.plan_json ? JSON.parse(p.plan_json) : undefined,
        briefEdits: JSON.parse(p.brief_edits_json || '[]'),
        repoPatches: JSON.parse(p.repo_patches_json || '[]'),
        notes: p.notes,
        createdAt: isoToDate(p.created_at)!,
      },
      update: {},
    });
  }
  total += proposals.length;

  // ── 3. approvals → agent_approvals ────────────────────────────────
  const approvals = sqlite.prepare('SELECT * FROM approvals').all() as any[];
  console.log(`Migrating ${approvals.length} approvals...`);
  for (const a of approvals) {
    await prisma.agentApproval.upsert({
      where: { approvalId: a.approval_id },
      create: {
        approvalId: a.approval_id,
        runId: a.run_id,
        proposalId: a.proposal_id,
        actor: a.actor,
        approvedAt: isoToDate(a.approved_at)!,
      },
      update: {},
    });
  }
  total += approvals.length;

  // ── 4. audit_events → agent_audit_events ──────────────────────────
  const audits = sqlite.prepare('SELECT * FROM audit_events').all() as any[];
  console.log(`Migrating ${audits.length} audit events...`);
  for (const e of audits) {
    await prisma.agentAuditEvent.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        runId: e.run_id,
        type: e.type,
        payload: JSON.parse(e.payload_json || '{}'),
        at: isoToDate(e.at)!,
      },
      update: {},
    });
  }
  total += audits.length;

  // ── 5. step_results → agent_step_results ──────────────────────────
  const steps = sqlite.prepare('SELECT * FROM step_results').all() as any[];
  console.log(`Migrating ${steps.length} step results...`);
  for (const s of steps) {
    await prisma.agentStepResult.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        runId: s.run_id,
        step: s.step,
        result: JSON.parse(s.result_json),
        createdAt: isoToDate(s.created_at)!,
      },
      update: {},
    });
  }
  total += steps.length;

  // ── 6. workspace_repos → agent_workspace_repos ────────────────────
  const repos = sqlite.prepare('SELECT * FROM workspace_repos').all() as any[];
  console.log(`Migrating ${repos.length} workspace repos...`);
  for (const r of repos) {
    await prisma.agentWorkspaceRepo.upsert({
      where: {
        workspaceId_githubRepoId: {
          workspaceId: r.workspace_id,
          githubRepoId: r.github_repo_id,
        },
      },
      create: {
        id: r.id,
        workspaceId: r.workspace_id,
        githubRepoId: r.github_repo_id,
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        localPath: r.local_path,
        isDefault: r.is_default === 1,
        connectedAt: isoToDate(r.connected_at)!,
        connectedBy: r.connected_by,
      },
      update: {},
    });
  }
  total += repos.length;

  // ── 7. workspace_rules → agent_workspace_rules ────────────────────
  const rules = sqlite.prepare('SELECT * FROM workspace_rules').all() as any[];
  console.log(`Migrating ${rules.length} workspace rules...`);
  for (const r of rules) {
    await prisma.agentWorkspaceRule.upsert({
      where: {
        workspaceId_docId: {
          workspaceId: r.workspace_id,
          docId: r.doc_id,
        },
      },
      create: {
        id: r.id,
        workspaceId: r.workspace_id,
        docId: r.doc_id,
        docTitle: r.doc_title,
        isEnabled: r.is_enabled === 1,
        createdAt: isoToDate(r.created_at)!,
      },
      update: {},
    });
  }
  total += rules.length;

  // ── 8. chat_sessions → agent_chat_sessions ────────────────────────
  const sessions = sqlite.prepare('SELECT * FROM chat_sessions').all() as any[];
  console.log(`Migrating ${sessions.length} chat sessions...`);
  for (const s of sessions) {
    await prisma.agentChatSession.upsert({
      where: {
        workspaceId_docId: {
          workspaceId: s.workspace_id,
          docId: s.doc_id,
        },
      },
      create: {
        id: s.id,
        workspaceId: s.workspace_id,
        docId: s.doc_id,
        claudeSessionId: s.claude_session_id,
        createdAt: isoToDate(s.created_at)!,
        updatedAt: isoToDate(s.updated_at)!,
      },
      update: {},
    });
  }
  total += sessions.length;

  // ── 9. chat_messages → agent_chat_messages ────────────────────────
  const messages = sqlite.prepare('SELECT * FROM chat_messages').all() as any[];
  console.log(`Migrating ${messages.length} chat messages...`);
  for (const m of messages) {
    await prisma.agentChatMessage.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        sessionId: m.session_id,
        role: m.role,
        content: m.content,
        timestamp: isoToDate(m.timestamp)!,
      },
      update: {},
    });
  }
  total += messages.length;

  // ── Done ──────────────────────────────────────────────────────────
  sqlite.close();
  await prisma.$disconnect();

  console.log(`\n✅ Migrated ${total} rows across 9 tables.`);
  console.log(`\n💡 Puedes verificar con:`);
  console.log(
    `   psql "$DATABASE_URL" -c "SELECT 'agent_runs', count(*) FROM agent_runs UNION ALL SELECT 'agent_chat_messages', count(*) FROM agent_chat_messages UNION ALL SELECT 'agent_workspace_rules', count(*) FROM agent_workspace_rules;"`
  );
  console.log(`\n🗑️  Cuando estés seguro, puedes eliminar el archivo SQLite:`);
  console.log(`   rm ${DB_PATH}`);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
