import { User } from '../../user/user.entity';
import { IBaseDao } from './base-dao.interface';

/** 用户 DAO */
export interface IUserDao extends IBaseDao<User> {
  /** 精确按用户名查询 */
  findByUsername(username: string): Promise<User | null>;

  /** 按 id 查询并加载角色（用于详情等） */
  findWithRolesById(id: string): Promise<User | null>;

  /** 覆盖用户的角色关联 */
  assignRoles(userId: string, roleIds: string[]): Promise<User>;
}
