import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtUser } from '../auth/types/jwt-user.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentChatStreamPayload, AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * SSE 流式对话（POST + 原始 Response，避免全局 JSON 包装破坏流）
   * 事件名固定为 `message`，与 API_CONTRACTS 一致。
   */
  @Post('chat')
  @SkipResponseWrap()
  async chat(
    @Body() body: ChatDto,
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const flushable = res as Response & { flushHeaders?: () => void };
    flushable.flushHeaders?.();

    const writeEvent = (payload: AgentChatStreamPayload) => {
      res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const payload of this.agentService.chatStream(user, body)) {
        writeEvent(payload);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '流式对话失败';
      writeEvent({ type: 'error', message });
    } finally {
      res.end();
    }
  }
}
