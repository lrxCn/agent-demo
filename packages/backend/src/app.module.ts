import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from './agent/agent.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AdminBootstrapService } from './bootstrap/admin-bootstrap.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { TraceInterceptor } from './common/interceptors/trace.interceptor';
import { WsModule } from './common/gateways/ws.module';
import { StructuredLogMiddleware } from './common/middleware/structured-log.middleware';
import { DaoModule } from './dao/dao.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PermissionModule } from './permission/permission.module';
import { RoleModule } from './role/role.module';
import { StudentModule } from './student/student.module';
import { UserModule } from './user/user.module';

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
    PermissionModule,
    RoleModule,
    AuthModule,
    UserModule,
    StudentModule,
    WsModule,
    AgentModule,
    KnowledgeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AdminBootstrapService,
    // 监控体系：trace 拦截器必须在 response 之前（更外层）
    { provide: APP_INTERCEPTOR, useClass: TraceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(StructuredLogMiddleware).forRoutes('*');
  }
}
