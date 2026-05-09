import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { BatchCreateStudentsDto } from './dto/batch-create-students.dto';
import { BatchDeleteStudentsDto } from './dto/batch-delete-students.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentService } from './student.service';

@Controller('students')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get()
  @RequirePermissions('student:view')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('keyword') keyword?: string,
  ) {
    const query: PaginationQuery = { page, pageSize, keyword };
    return this.studentService.list(query);
  }

  /** 静态路径需排在 :id 之前，避免 id 被解析为 "batch" */
  @Post('batch')
  @RequirePermissions('student:create')
  batchCreate(@Body() dto: BatchCreateStudentsDto) {
    return this.studentService.batchCreate(dto);
  }

  @Delete('batch')
  @RequirePermissions('student:delete')
  batchDelete(@Body() dto: BatchDeleteStudentsDto) {
    return this.studentService.batchDelete(dto.ids);
  }

  @Get(':id')
  @RequirePermissions('student:view')
  findOne(@Param('id') id: string) {
    return this.studentService.findOne(id);
  }

  @Post()
  @RequirePermissions('student:create')
  create(@Body() dto: CreateStudentDto) {
    return this.studentService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('student:update')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('student:delete')
  remove(@Param('id') id: string) {
    return this.studentService.remove(id);
  }
}
