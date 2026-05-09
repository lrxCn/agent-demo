import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 更新角色 */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
