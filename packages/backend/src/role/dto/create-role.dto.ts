import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 创建角色 */
export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
