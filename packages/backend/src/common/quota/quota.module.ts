import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { QuotaService } from './quota.service';

@Module({
  imports: [AuditModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
