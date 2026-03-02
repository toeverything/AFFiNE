import { Module } from '@nestjs/common';

import { DocStorageModule } from '../../core/doc';
import { AgentPlatformController } from './agent.controller';
import { AgentPlatformService } from './agent.service';
import { AgentStorageService } from './storage/prisma.adapter';
import { ClaudeCodeAdapter } from './llm/claude-code.adapter';
import { RepoAdapter } from './repo/repo.adapter';
import { RepoSecurityService } from './repo/security';
import { GitHubAppService } from './github/github-app.service';
import { CommentAgentJob } from './comment-agent.job';

@Module({
  imports: [DocStorageModule],
  providers: [
    AgentPlatformService,
    AgentStorageService,
    ClaudeCodeAdapter,
    RepoAdapter,
    RepoSecurityService,
    GitHubAppService,
    CommentAgentJob,
  ],
  controllers: [AgentPlatformController],
  exports: [AgentPlatformService],
})
export class AgentPlatformModule {}
