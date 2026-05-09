import { Permission } from '../../permission/permission.entity';
import { IBaseDao } from './base-dao.interface';

/** 权限 DAO */
export interface IPermissionDao extends IBaseDao<Permission> {}
