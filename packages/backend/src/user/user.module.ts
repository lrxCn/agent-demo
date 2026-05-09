import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DaoModule } from '../dao/dao.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [DaoModule, AuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
