import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 更新用户请求体（字段均可选） */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nickname?: string;
}
