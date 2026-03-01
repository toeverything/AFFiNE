/**
 * Agent Platform Service — public API for the frontend module.
 */
import { Service } from '@toeverything/infra';
import type { AgentPlatformStore } from '../stores/agent';
import type { AgentStep, Plan } from '@aion/agent-contracts';

export class AgentPlatformService extends Service {
  constructor(private readonly store: AgentPlatformStore) {
    super();
  }

  // Legacy LiveData
  get currentRun$() { return this.store.currentRun$; }
  get proposals$() { return this.store.proposals$; }
  get approvals$() { return this.store.approvals$; }
  get auditLog$() { return this.store.auditLog$; }
  get ambiguities$() { return this.store.ambiguities$; }
  get plan$() { return this.store.plan$; }
  get preview$() { return this.store.preview$; }
  get loading$() { return this.store.loading$; }
  get error$() { return this.store.error$; }
  get config$() { return this.store.config$; }
  get chatMessages$() { return this.store.chatMessages$; }
  get chatSessionId$() { return this.store.chatSessionId$; }
  get chatStreaming$() { return this.store.chatStreaming$; }

  // Step LiveData
  get currentStep$() { return this.store.currentStep$; }
  get stepResults$() { return this.store.stepResults$; }
  get validateBrief$() { return this.store.validateBrief$; }
  get detectAmbiguity$() { return this.store.detectAmbiguity$; }
  get technicalPlan$() { return this.store.technicalPlan$; }
  get briefEpics$() { return this.store.briefEpics$; }
  get generateTasks$() { return this.store.generateTasks$; }
  get generateCheckpoints$() { return this.store.generateCheckpoints$; }
  get codeGeneration$() { return this.store.codeGeneration$; }
  get checkAlignment$() { return this.store.checkAlignment$; }

  // Legacy methods
  createRun(
    workspaceId: string,
    docId: string,
    briefContent: string,
    repoTarget?: { repoId: string; localPath: string; remoteUrl?: string; defaultBranch?: string },
    docTitle?: string
  ) {
    return this.store.createRun(workspaceId, docId, briefContent, repoTarget, docTitle);
  }

  loadRun(runId: string) { return this.store.loadRun(runId); }

  analyzeAmbiguity(runId: string, briefContent: string) {
    return this.store.analyzeAmbiguity(runId, briefContent);
  }

  generatePlan(
    runId: string,
    briefContent: string,
    resolvedAmbiguities?: Array<{ id: string; answer: string }>
  ) {
    return this.store.generatePlan(runId, briefContent, resolvedAmbiguities);
  }

  proposeChanges(runId: string, briefContent: string, plan?: Plan) {
    return this.store.proposeChanges(runId, briefContent, plan);
  }

  previewProposal(runId: string, proposalId: string, briefContent: string) {
    return this.store.previewProposal(runId, proposalId, briefContent);
  }

  approve(runId: string, proposalId: string, actor: string) {
    return this.store.approve(runId, proposalId, actor);
  }

  apply(runId: string, approvalId: string) {
    return this.store.apply(runId, approvalId);
  }

  createPR(runId: string, approvalId: string, title?: string, body?: string) {
    return this.store.createPR(runId, approvalId, title, body);
  }

  loadConfig() { return this.store.loadConfig(); }

  // Step methods
  executeStep(
    runId: string,
    step: AgentStep,
    briefContent: string,
    context?: Record<string, unknown>
  ) {
    return this.store.executeStep(runId, step, briefContent, context);
  }

  loadStepResults(runId: string) {
    return this.store.loadStepResults(runId);
  }

  resetStepState() {
    this.store.resetStepState();
  }

  // GitHub integration
  get githubStatus$() { return this.store.githubStatus$; }
  get availableRepos$() { return this.store.availableRepos$; }
  get workspaceRepos$() { return this.store.workspaceRepos$; }

  loadGitHubStatus() { return this.store.loadGitHubStatus(); }
  loadAvailableRepos() { return this.store.loadAvailableRepos(); }
  loadWorkspaceRepos(workspaceId: string) { return this.store.loadWorkspaceRepos(workspaceId); }

  connectRepo(
    workspaceId: string,
    githubRepoId: number,
    fullName: string,
    defaultBranch: string,
    setAsDefault: boolean
  ) {
    return this.store.connectRepo(workspaceId, githubRepoId, fullName, defaultBranch, setAsDefault);
  }

  disconnectRepo(workspaceId: string, repoConnectionId: string) {
    return this.store.disconnectRepo(workspaceId, repoConnectionId);
  }

  setDefaultRepo(workspaceId: string, repoConnectionId: string) {
    return this.store.setDefaultRepo(workspaceId, repoConnectionId);
  }

  // Workspace Rules
  get workspaceRules$() { return this.store.workspaceRules$; }
  loadWorkspaceRules(workspaceId: string) { return this.store.loadWorkspaceRules(workspaceId); }
  addRule(workspaceId: string, docId: string, docTitle?: string) { return this.store.addRule(workspaceId, docId, docTitle); }
  removeRule(workspaceId: string, ruleId: string) { return this.store.removeRule(workspaceId, ruleId); }

  // Repo changes
  get repoChanges$() { return this.store.repoChanges$; }
  get repoChangesLoading$() { return this.store.repoChangesLoading$; }
  loadRepoChanges(workspaceId: string, docId?: string) { return this.store.loadRepoChanges(workspaceId, docId); }
  commitChanges(workspaceId: string, message: string, docId?: string) { return this.store.commitChanges(workspaceId, message, docId); }

  // Chat (per-document)
  get chatDocId$() { return this.store.chatDocId$; }

  setChatWorkspaceId(workspaceId: string) {
    this.store.setChatWorkspaceId(workspaceId);
  }

  switchChatDoc(docId: string) {
    return this.store.switchChatDoc(docId);
  }

  sendChat(docId: string, message: string, cwd?: string, documentContent?: string) {
    return this.store.sendChat(docId, message, cwd, documentContent);
  }

  applyEdit(workspaceId: string, docId: string, original: string, replacement: string, documentContent?: string) {
    return this.store.applyEdit(workspaceId, docId, original, replacement, documentContent);
  }

  clearChat(docId: string) { return this.store.clearChat(docId); }
}
