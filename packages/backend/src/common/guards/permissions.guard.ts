import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtUser } from '../../auth/types/jwt-user.types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/** 校验当前用户是否具备路由要求的全部权限（含 `*` 通配） */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;
    if (!user) {
      return false;
    }
    if (user.permissionCodes.includes('*')) {
      return true;
    }
    return required.every((code) => user.permissionCodes.includes(code));
  }
}
