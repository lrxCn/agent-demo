import { Student } from '../../student/student.entity';
import { IBaseDao } from './base-dao.interface';

/** 学生 DAO */
export interface IStudentDao extends IBaseDao<Student> {
  /** 按学号查询（用于唯一性校验） */
  findByStudentNo(studentNo: string): Promise<Student | null>;
  /** 按主键批量删除，返回删除行数 */
  deleteMany(ids: string[]): Promise<number>;
}
