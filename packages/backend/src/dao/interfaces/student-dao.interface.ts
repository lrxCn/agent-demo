import { Student } from '../../student/student.entity';
import { IBaseDao } from './base-dao.interface';

/** 学生 DAO */
export interface IStudentDao extends IBaseDao<Student> {}
