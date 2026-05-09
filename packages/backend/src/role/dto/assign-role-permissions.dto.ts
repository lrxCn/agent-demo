import { IsArray, IsUUID } from 'class-validator';

/** 为角色分配权限（空数组表示清空） */
export class AssignRolePermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
