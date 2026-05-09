import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBase } from '../knowledge/knowledge-base.entity';
import { Permission } from '../permission/permission.entity';
import { Role } from '../role/role.entity';
import { Student } from '../student/student.entity';
import { User } from '../user/user.entity';
import {
  KNOWLEDGE_DAO,
  PERMISSION_DAO,
  ROLE_DAO,
  STUDENT_DAO,
  USER_DAO,
} from './dao.tokens';
import { KnowledgeDaoSqlite } from './sqlite/knowledge-dao.sqlite';
import { PermissionDaoSqlite } from './sqlite/permission-dao.sqlite';
import { RoleDaoSqlite } from './sqlite/role-dao.sqlite';
import { StudentDaoSqlite } from './sqlite/student-dao.sqlite';
import { UserDaoSqlite } from './sqlite/user-dao.sqlite';

/** DAO 抽象层：接口 token → SQLite 实现，切换数据源时只改绑定 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, Student, KnowledgeBase]),
  ],
  providers: [
    { provide: USER_DAO, useClass: UserDaoSqlite },
    { provide: ROLE_DAO, useClass: RoleDaoSqlite },
    { provide: PERMISSION_DAO, useClass: PermissionDaoSqlite },
    { provide: STUDENT_DAO, useClass: StudentDaoSqlite },
    { provide: KNOWLEDGE_DAO, useClass: KnowledgeDaoSqlite },
  ],
  exports: [USER_DAO, ROLE_DAO, PERMISSION_DAO, STUDENT_DAO, KNOWLEDGE_DAO],
})
export class DaoModule {}
