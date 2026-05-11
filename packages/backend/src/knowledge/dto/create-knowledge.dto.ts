import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 上传知识库时的表单字段（与 multipart 中的 name/description 一致） */
export class CreateKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
