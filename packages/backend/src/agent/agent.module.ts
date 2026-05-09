import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WsModule } from '../common/gateways/ws.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [HttpModule, WsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
