import { IsNotEmpty, IsString } from 'class-validator';

/** 刷新 access token */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
