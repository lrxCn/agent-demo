import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import { AppGateway } from './app.gateway';
import { FrontendToolResultBus, UserFrontendToolsService } from './user-frontend-tools.service';

type MockSocket = Pick<Socket, 'id' | 'data' | 'connected' | 'handshake' | 'disconnect' | 'emit'>;

function createSocket(id: string, token: string): MockSocket {
  return {
    id,
    data: {},
    connected: true,
    handshake: ({
      query: { token },
      auth: {},
      headers: {},
    } as unknown) as Socket['handshake'],
    disconnect: jest.fn(),
    emit: jest.fn(),
  };
}

describe('AppGateway RTC signaling', () => {
  let gateway: AppGateway;

  beforeEach(() => {
    const jwtService = {
      verifyAsync: jest.fn(async (token: string) => ({
        typ: 'access',
        sub: token,
      })),
    } as unknown as JwtService;
    const configService = {
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    const userTools = new UserFrontendToolsService();
    const toolResultBus = new FrontendToolResultBus();
    gateway = new AppGateway(jwtService, configService, userTools, toolResultBus);
  });

  it('应在 rtc:call 时向目标用户转发 rtc:incoming', async () => {
    const caller = createSocket('socket-caller', 'user-caller');
    const callee = createSocket('socket-callee', 'user-callee');

    await gateway.handleConnection(caller as Socket);
    await gateway.handleConnection(callee as Socket);

    const result = gateway.handleRtcCall(caller as Socket, { targetUserId: 'user-callee' });

    expect(result).toEqual({ ok: true });
    expect(callee.emit).toHaveBeenCalledWith(
      'rtc:incoming',
      expect.objectContaining({ callerUserId: 'user-caller' }),
    );
  });

  it('应支持 answer/reject/signal/hangup 转发给目标用户', async () => {
    const caller = createSocket('socket-caller', 'user-caller');
    const callee = createSocket('socket-callee', 'user-callee');

    await gateway.handleConnection(caller as Socket);
    await gateway.handleConnection(callee as Socket);

    expect(gateway.handleRtcAnswer(callee as Socket, { targetUserId: 'user-caller' })).toEqual({ ok: true });
    expect(caller.emit).toHaveBeenCalledWith('rtc:answered', { userId: 'user-callee' });

    expect(gateway.handleRtcReject(callee as Socket, { targetUserId: 'user-caller' })).toEqual({ ok: true });
    expect(caller.emit).toHaveBeenCalledWith('rtc:rejected', { userId: 'user-callee' });

    expect(
      gateway.handleRtcSignal(callee as Socket, {
        targetUserId: 'user-caller',
        signal: { sdp: 'demo' },
      }),
    ).toEqual({ ok: true });
    expect(caller.emit).toHaveBeenCalledWith('rtc:signal', {
      fromUserId: 'user-callee',
      signal: { sdp: 'demo' },
    });

    expect(gateway.handleRtcHangup(callee as Socket, { targetUserId: 'user-caller' })).toEqual({ ok: true });
    expect(caller.emit).toHaveBeenCalledWith('rtc:hangup', { userId: 'user-callee' });
  });

  it('应返回在线用户列表并在断开后清理', async () => {
    const caller = createSocket('socket-caller', 'user-caller');
    const callee = createSocket('socket-callee', 'user-callee');

    await gateway.handleConnection(caller as Socket);
    await gateway.handleConnection(callee as Socket);

    const online = gateway.handleRtcOnlineUsers(caller as Socket);
    expect(online).toEqual({
      ok: true,
      users: expect.arrayContaining(['user-caller', 'user-callee']),
    });

    gateway.handleDisconnect(callee as Socket);
    const onlineAfter = gateway.handleRtcOnlineUsers(caller as Socket);
    expect(onlineAfter).toEqual({ ok: true, users: ['user-caller'] });
  });
});
