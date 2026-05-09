import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

/** 批量创建学生 */
export class BatchCreateStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  items: CreateStudentDto[];
}
