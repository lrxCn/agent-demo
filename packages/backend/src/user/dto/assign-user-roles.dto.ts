import { IsArray, IsUUID } from 'class-validator';

/** 为用户分配角色（空数组表示清空角色） */
export class AssignUserRolesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}
