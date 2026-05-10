import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../../auth/types/jwt-user.types';

/** 从请求上下文读取 JWT 校验后的当前用户 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtUser | undefined,
    ctx: ExecutionContext,
  ): JwtUser | JwtUser[keyof JwtUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    if (data) {
      return user[data];
    }
    return user;
  },
);
