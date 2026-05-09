import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PERMISSION_DAO } from '../dao/dao.tokens';
import { IPermissionDao } from '../dao/interfaces/permission-dao.interface';
import { Permission } from './permission.entity';

/** 预置权限（与 API 契约及 prompts 对齐；含 permission:view） */
const PRESET_PERMISSIONS: ReadonlyArray<{
  code: string;
  name: string;
  groupName: string;
}> = [
  { code: 'permission:view', name: '查看权限列表', groupName: '权限管理' },
  { code: 'user:view', name: '查看用户', groupName: '用户管理' },
  { code: 'user:create', name: '创建用户', groupName: '用户管理' },
  { code: 'user:update', name: '更新用户', groupName: '用户管理' },
  { code: 'user:delete', name: '删除用户', groupName: '用户管理' },
  { code: 'user:assign-role', name: '分配角色', groupName: '用户管理' },
  { code: 'role:view', name: '查看角色', groupName: '角色管理' },
  { code: 'role:create', name: '创建角色', groupName: '角色管理' },
  { code: 'role:update', name: '更新角色', groupName: '角色管理' },
  { code: 'role:delete', name: '删除角色', groupName: '角色管理' },
  { code: 'role:assign-permission', name: '分配权限', groupName: '角色管理' },
  { code: 'student:view', name: '查看学生', groupName: '学生管理' },
  { code: 'student:create', name: '创建学生', groupName: '学生管理' },
  { code: 'student:update', name: '更新学生', groupName: '学生管理' },
  { code: 'student:delete', name: '删除学生', groupName: '学生管理' },
  { code: 'knowledge:view', name: '查看知识库', groupName: '知识库' },
  { code: 'knowledge:create', name: '上传知识', groupName: '知识库' },
  { code: 'knowledge:delete', name: '删除知识', groupName: '知识库' },
  { code: 'knowledge:manage', name: '管理知识库权限', groupName: '知识库' },
];

/** 权限分组列表项 */
export interface PermissionGroupItem {
  groupName: string;
  permissions: Array<Pick<Permission, 'id' | 'code' | 'name'>>;
}

@Injectable()
export class PermissionService implements OnModuleInit {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    @Inject(PERMISSION_DAO) private readonly permissionDao: IPermissionDao,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensurePresetPermissions();
    } catch (err) {
      this.logger.error(
        '预置权限初始化失败',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  /** 按分组返回权限树（不含 system 通配项时可由调用方过滤） */
  async listGrouped(): Promise<{ groups: PermissionGroupItem[] }> {
    const all = await this.permissionDao.findAllOrdered();
    const withoutWildcard = all.filter((p) => p.code !== '*');
    const map = new Map<string, PermissionGroupItem>();
    for (const p of withoutWildcard) {
      const key = p.groupName || '其他';
      let group = map.get(key);
      if (!group) {
        group = { groupName: key, permissions: [] };
        map.set(key, group);
      }
      group.permissions.push({
        id: p.id,
        code: p.code,
        name: p.name,
      });
    }
    const groups = [...map.values()].sort((a, b) =>
      a.groupName.localeCompare(b.groupName, 'zh-CN'),
    );
    return { groups };
  }

  private async ensurePresetPermissions(): Promise<void> {
    for (const row of PRESET_PERMISSIONS) {
      const existing = await this.permissionDao.findByCode(row.code);
      if (existing) {
        continue;
      }
      await this.permissionDao.create({
        code: row.code,
        name: row.name,
        groupName: row.groupName,
      });
      this.logger.log(`已创建预置权限: ${row.code}`);
    }
  }
}
