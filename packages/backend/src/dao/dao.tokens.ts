/** DAO 注入 token（与规范中的字符串一致，便于模块绑定） */
export const USER_DAO = 'IUserDao';
export const ROLE_DAO = 'IRoleDao';
export const PERMISSION_DAO = 'IPermissionDao';
export const STUDENT_DAO = 'IStudentDao';
export const KNOWLEDGE_DAO = 'IKnowledgeDao';
export const AUDIT_LOG_DAO = Symbol('AUDIT_LOG_DAO');
