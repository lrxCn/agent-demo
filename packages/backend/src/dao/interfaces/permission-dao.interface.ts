import { Permission } from '../../permission/permission.entity';
import { IBaseDao } from './base-dao.interface';

/** 权限 DAO */
export interface IPermissionDao extends IBaseDao<Permission> {
  /** 按权限 code 精确查询 */
  findByCode(code: string): Promise<Permission | null>;
}
