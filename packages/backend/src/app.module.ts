import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DaoModule } from './dao/dao.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // monorepo 根目录的 .env
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/agent-demo.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    DaoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
