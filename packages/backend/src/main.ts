import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // SQLite 文件目录需存在，否则 better-sqlite3 无法创建库文件
  const dataDir = join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
