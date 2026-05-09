import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hash as bcryptHash } from 'bcryptjs';
import { PERMISSION_DAO, ROLE_DAO, USER_DAO } from '../dao/dao.tokens';
import { IPermissionDao } from '../dao/interfaces/permission-dao.interface';
import { IRoleDao } from '../dao/interfaces/role-dao.interface';
import { IUserDao } from '../dao/interfaces/user-dao.interface';

const BCRYPT_ROUNDS = 10;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const ADMIN_ROLE_NAME = 'admin';
const WILDCARD_PERMISSION_CODE = '*';

/** 应用启动时确保内置超级管理员、角色与通配权限存在 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @Inject(USER_DAO) private readonly userDao: IUserDao,
    @Inject(ROLE_DAO) private readonly roleDao: IRoleDao,
    @Inject(PERMISSION_DAO) private readonly permissionDao: IPermissionDao,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAdminSetup();
    } catch (err) {
      this.logger.error(
        '内置超级管理员初始化失败',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  private async ensureAdminSetup(): Promise<void> {
    let wildcard = await this.permissionDao.findByCode(WILDCARD_PERMISSION_CODE);
    if (!wildcard) {
      wildcard = await this.permissionDao.create({
        code: WILDCARD_PERMISSION_CODE,
        name: '全部权限',
        groupName: 'system',
      });
      this.logger.log(`已创建通配权限: ${WILDCARD_PERMISSION_CODE}`);
    }

    let adminRole = await this.roleDao.findByName(ADMIN_ROLE_NAME);
    if (!adminRole) {
      adminRole = await this.roleDao.create({
        name: ADMIN_ROLE_NAME,
        description: '超级管理员',
      });
      this.logger.log(`已创建角色: ${ADMIN_ROLE_NAME}`);
    }
    adminRole = await this.roleDao.setPermissions(adminRole.id, [wildcard.id]);

    let adminUser = await this.userDao.findByUsername(ADMIN_USERNAME);
    if (!adminUser) {
      const passwordHash = await bcryptHash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
      adminUser = await this.userDao.create({
        username: ADMIN_USERNAME,
        password: passwordHash,
        nickname: '管理员',
      });
      this.logger.log(`已创建用户: ${ADMIN_USERNAME}`);
    }

    await this.userDao.assignRoles(adminUser.id, [adminRole.id]);
    this.logger.log('已确保 admin 用户绑定 admin 角色与通配权限');
  }
}
