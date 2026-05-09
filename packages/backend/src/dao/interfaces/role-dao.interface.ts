import { Role } from '../../role/role.entity';
import { IBaseDao } from './base-dao.interface';

/** 角色 DAO */
export interface IRoleDao extends IBaseDao<Role> {
  /** 按角色名精确查询 */
  findByName(name: string): Promise<Role | null>;

  /** 批量加载角色及其权限（用于列表页回显，避免 N+1） */
  findByIdsWithPermissions(ids: string[]): Promise<Role[]>;

  /** 覆盖角色的权限关联 */
  setPermissions(roleId: string, permissionIds: string[]): Promise<Role>;
}
