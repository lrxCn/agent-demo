/** JWT 校验后挂载到 request.user 的载荷 */
export interface JwtUser {
  id: string;
  username: string;
  nickname: string;
  roleNames: string[];
  permissionCodes: string[];
}
