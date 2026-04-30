import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { MediaModule } from '@/modules/media/media.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { ChatQuestionLlmService } from '@/modules/agent/question/chat-question-llm.service';
import { ChatQuestionService } from '@/modules/agent/question/chat-question.service';
import { OrchestratorLlmService } from '@/modules/agent/orchestrator-llm.service';
import { PemAgentLlmService } from '@/modules/agent/pem-agent-llm.service';
import { PemAgentService } from '@/modules/agent/pem-agent.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    MemoryModule,
    MediaModule,
    forwardRef(() => ExtractsModule),
    ProfileModule,
    StorageModule,
  ],
  providers: [
    PemAgentLlmService,
    PemAgentService,
    OrchestratorLlmService,
    ChatQuestionLlmService,
    ChatQuestionService,
  ],
  exports: [
    PemAgentService,
    OrchestratorLlmService,
    ChatQuestionService,
    PemAgentLlmService,
  ],
})
export class AgentModule {}
