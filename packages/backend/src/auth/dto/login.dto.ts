import { IsString, MinLength } from 'class-validator';

/** 登录请求体 */
export class LoginDto {
  @IsString()
  @MinLength(1)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
