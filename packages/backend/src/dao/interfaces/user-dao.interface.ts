import { User } from '../../user/user.entity';
import { IBaseDao } from './base-dao.interface';

/** 用户 DAO */
export interface IUserDao extends IBaseDao<User> {}
