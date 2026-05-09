import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import {
  FrontendToolResultBus,
  FrontendToolResultPayload,
  UserFrontendToolsService,
} from './user-frontend-tools.service';

/** Socket.io 握手后挂载的自定义字段 */
interface AuthenticatedSocketData {
  userId?: string;
}

function getSocketData(client: Socket): AuthenticatedSocketData {
  const data = client.data as AuthenticatedSocketData;
  return data;
}

const ACCESS_TYP = 'access';

@Injectable()
@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);
  /** 在线用户：同一 userId 多连接时以后连上的为准 */
  private readonly onlineUsers = new Map<string, Socket>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly userTools: UserFrontendToolsService,
    private readonly toolResultBus: FrontendToolResultBus,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractAccessToken(client);
    if (!token) {
      this.logger.warn('WebSocket 连接缺少 token，已断开');
      client.disconnect(true);
      return;
    }

    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string; typ?: string }>(token, {
        secret,
      });
      if (payload.typ !== ACCESS_TYP || !payload.sub) {
        this.logger.warn('WebSocket token 类型或主体无效，已断开');
        client.disconnect(true);
        return;
      }
      if (!client.connected) {
        return;
      }
      getSocketData(client).userId = payload.sub;
      this.onlineUsers.set(payload.sub, client);
      this.logger.debug(`WebSocket 已连接 userId=${payload.sub}`);
    } catch {
      this.logger.warn('WebSocket JWT 校验失败，已断开');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = getSocketData(client).userId;
    if (!userId) {
      return;
    }
    const current = this.onlineUsers.get(userId);
    if (current?.id === client.id) {
      this.onlineUsers.delete(userId);
    }
    this.userTools.clearUser(userId);
    this.logger.debug(`WebSocket 已断开 userId=${userId}`);
  }

  /** 供 Agent 层向当前用户推送 tool:invoke（后续 Phase 4 使用） */
  getSocketByUserId(userId: string): Socket | undefined {
    return this.onlineUsers.get(userId);
  }

  @SubscribeMessage('tools:update')
  handleToolsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: true } | { ok: false; message: string } {
    const userId = getSocketData(client).userId;
    if (!userId) {
      return { ok: false, message: '未认证' };
    }
    if (!body || typeof body !== 'object' || !Array.isArray((body as { tools?: unknown }).tools)) {
      return { ok: false, message: 'tools 须为字符串数组' };
    }
    const raw = (body as { tools: unknown[] }).tools;
    const tools = raw.filter((t): t is string => typeof t === 'string');
    this.userTools.setTools(userId, tools);
    return { ok: true };
  }

  @SubscribeMessage('tool:result')
  handleToolResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: true } | { ok: false; message: string } {
    const userId = getSocketData(client).userId;
    if (!userId) {
      return { ok: false, message: '未认证' };
    }
    const parsed = this.parseToolResultPayload(body);
    if (parsed.ok === false) {
      return { ok: false, message: parsed.message };
    }
    this.toolResultBus.emitToolResult(userId, parsed.payload);
    return { ok: true };
  }

  @SubscribeMessage('rtc:call')
  handleRtcCall(@MessageBody() _body: unknown): void {
    /* Phase 6：发起呼叫 */
  }

  @SubscribeMessage('rtc:answer')
  handleRtcAnswer(@MessageBody() _body: unknown): void {
    /* Phase 6：接听/拒绝 */
  }

  @SubscribeMessage('rtc:signal')
  handleRtcSignal(@MessageBody() _body: unknown): void {
    /* Phase 6：信令交换 */
  }

  @SubscribeMessage('rtc:hangup')
  handleRtcHangup(@MessageBody() _body: unknown): void {
    /* Phase 6：挂断 */
  }

  private extractAccessToken(client: Socket): string | undefined {
    const q = client.handshake.query['token'];
    const fromQuery = Array.isArray(q) ? q[0] : q;
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim();
    }
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const fromAuth = auth?.['token'];
    if (typeof fromAuth === 'string' && fromAuth.trim()) {
      return fromAuth.trim();
    }
    const rawHeader = client.handshake.headers['authorization'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }
    return undefined;
  }

  private parseToolResultPayload(
    body: unknown,
  ): { ok: true; payload: FrontendToolResultPayload } | { ok: false; message: string } {
    if (!body || typeof body !== 'object') {
      return { ok: false, message: 'body 须为对象' };
    }
    const o = body as Record<string, unknown>;
    const id = typeof o['id'] === 'string' ? o['id'] : '';
    if (!id) {
      return { ok: false, message: '缺少 id' };
    }
    if (typeof o['success'] !== 'boolean') {
      return { ok: false, message: 'success 须为 boolean' };
    }
    const result = o['result'];
    return { ok: true, payload: { id, success: o['success'], result } };
  }
}
