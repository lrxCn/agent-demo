import { Module } from '@nestjs/common';
import { DaoModule } from '../dao/dao.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [DaoModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
