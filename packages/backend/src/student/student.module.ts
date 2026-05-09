import { Module } from '@nestjs/common';
import { DaoModule } from '../dao/dao.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [DaoModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
