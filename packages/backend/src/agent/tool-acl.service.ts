import { Injectable, Logger } from '@nestjs/common';

import { JwtUser } from '../auth/types/jwt-user.types';
import { AuditService } from '../common/audit/audit.service';

/**
 * 工具白名单服务：把 user.permissionCodes 转成 Agent 可调用的 builtin 工具名列表。
 *
 * 权限编码约定：
 *   agent:tool:<tool_name>   -> 单工具授权
 *   agent:tool:*             -> 通配（推荐管理员角色用）
 *   *                        -> 全局通配（当前 admin 角色使用）
 *   *:*                      -> 兼容其他通配表达
 *
 * 不在权限内的工具会被从 LangGraph input.allowed_builtin_tools 中剔除，
 * chat_node 拼 tools 时按该列表过滤，LLM 拿到的就根本没有该工具。
 */
@Injectable()
export class ToolAclService {
  private readonly logger = new Logger(ToolAclService.name);

  constructor(private readonly audit: AuditService) {}

  /** 全部已知 builtin 工具名（新增工具时同步） */
  private static readonly ALL_BUILTIN_TOOLS = [
    'calculate',
    'get_current_time',
    'debug_sleep_seconds',
    'debug_always_fail',
    'search_knowledge_base',
    'search_my_calls',
  ];

  resolveAllowed(user: JwtUser): string[] {
    const codes = new Set(user.permissionCodes ?? []);
    // 通配优先
    if (codes.has('*:*') || codes.has('*') || codes.has('agent:tool:*')) {
      return [...ToolAclService.ALL_BUILTIN_TOOLS];
    }

    const allowed = ToolAclService.ALL_BUILTIN_TOOLS.filter((toolName) =>
      codes.has(`agent:tool:${toolName}`),
    );

    if (allowed.length !== ToolAclService.ALL_BUILTIN_TOOLS.length) {
      // 部分工具被拒绝 → 异步落审计（不阻塞主流程）
      const denied = ToolAclService.ALL_BUILTIN_TOOLS.filter(
        (t) => !allowed.includes(t),
      );
      void this.audit.log({
        userId: user.id,
        eventType: 'tool_denied',
        severity: 'info',
        payload: { denied, allowed },
      });
    }

    if (allowed.length === 0) {
      this.logger.debug(`用户 ${user.id} 未命中任何 builtin 工具白名单`);
    }
    return allowed;
  }

  /** 仅日志用：把被拒绝的工具列出，便于审计 */
  diff(user: JwtUser, allowed: string[]): string[] {
    void user;
    return ToolAclService.ALL_BUILTIN_TOOLS.filter((t) => !allowed.includes(t));
  }
}
