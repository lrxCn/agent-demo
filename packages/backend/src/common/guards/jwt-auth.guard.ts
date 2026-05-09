import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** 要求请求携带合法 access JWT */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
