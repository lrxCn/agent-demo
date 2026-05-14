import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WsModule } from '../common/gateways/ws.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { SttService } from './stt.service';

@Module({
  imports: [HttpModule, WsModule],
  controllers: [AgentController, FeedbackController],
  providers: [AgentService, SttService, FeedbackService],
})
export class AgentModule {}
