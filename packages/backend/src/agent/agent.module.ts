import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [HttpModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
