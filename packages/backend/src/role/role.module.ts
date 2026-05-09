import { Module } from '@nestjs/common';
import { DaoModule } from '../dao/dao.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  imports: [DaoModule],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
