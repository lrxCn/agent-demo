import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** 批量删除学生 */
export class BatchDeleteStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}
