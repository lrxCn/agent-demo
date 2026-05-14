import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AuditModule } from '../common/audit/audit.module';
import { QuotaModule } from '../common/quota/quota.module';
import { WsModule } from '../common/gateways/ws.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { SttService } from './stt.service';
import { ToolAclService } from './tool-acl.service';

@Module({
  imports: [HttpModule, WsModule, QuotaModule, AuditModule],
  controllers: [AgentController, FeedbackController],
  providers: [AgentService, SttService, FeedbackService, ToolAclService],
})
export class AgentModule {}
