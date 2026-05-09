import { User } from '../user/user.entity';
import { JwtUser } from './types/jwt-user.types';

/** 将带角色与权限的 User 实体转为 JWT 用户载荷 */
export function userEntityToJwtUser(user: User): JwtUser {
  const roleNames = (user.roles ?? []).map((r) => r.name);
  const permissionCodes = new Set<string>();
  for (const role of user.roles ?? []) {
    for (const p of role.permissions ?? []) {
      permissionCodes.add(p.code);
    }
  }
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    roleNames,
    permissionCodes: [...permissionCodes],
  };
}
