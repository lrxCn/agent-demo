import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 创建用户请求体 */
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nickname?: string;
}
