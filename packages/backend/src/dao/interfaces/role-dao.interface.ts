import { Role } from '../../role/role.entity';
import { IBaseDao } from './base-dao.interface';

/** 角色 DAO */
export interface IRoleDao extends IBaseDao<Role> {}
