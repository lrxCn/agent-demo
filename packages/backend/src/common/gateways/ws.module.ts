import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { AppGateway } from './app.gateway';
import {
  FrontendToolResultBus,
  UserFrontendToolsService,
} from './user-frontend-tools.service';

@Module({
  imports: [AuthModule],
  providers: [UserFrontendToolsService, FrontendToolResultBus, AppGateway],
  exports: [UserFrontendToolsService, FrontendToolResultBus, AppGateway],
})
export class WsModule {}
