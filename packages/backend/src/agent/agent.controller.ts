import {
  Body,
  Controller,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtUser } from '../auth/types/jwt-user.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuotaService } from '../common/quota/quota.service';
import { AgentChatStreamPayload, AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';
import { SttService } from './stt.service';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly sttService: SttService,
    private readonly quota: QuotaService,
  ) {}

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
    // Phase 7-4 Step 1：按输入粗估 + 预留输出做入口配额预检
    const estimated = this.quota.estimateTokens(body.message) + 2000;
    const threadIdForReserve = body.thread_id?.trim()
      ? body.thread_id
      : `pending-${user.id}`;
    await this.quota.checkAndReserve(user.id, threadIdForReserve, estimated);

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

  private processedCallIds = new Set<string>();

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: { callerUserId?: string; calleeUserId?: string; callId?: string },
  ) {
    if (body.callId && this.processedCallIds.has(body.callId)) {
      this.logger.log(`检测到重复 Call ID: ${body.callId}，跳过处理。`);
      return { text: '[通话记录已由对端处理]' };
    }

    if (!file || !file.buffer || file.size <= 0) {
      return { code: 1, data: null, message: '请上传有效的录音文件' };
    }

    const text = await this.sttService.transcribe(
      file.buffer,
      file.originalname || 'call-record.webm',
    );

    if (body.callerUserId && body.calleeUserId) {
      try {
        const response = await fetch('http://127.0.0.1:8123/calls/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            caller_user_id: body.callerUserId,
            callee_user_id: body.calleeUserId,
            call_time: new Date().toISOString(),
          }),
        });
        if (!response.ok) {
          this.logger.warn(
            `Agent 通话记录入库返回状态异常: ${response.status}`,
          );
        } else {
          this.logger.log(
            `成功推送给 Agent 记录通话记录: ${body.callerUserId} - ${body.calleeUserId}`,
          );
        }
      } catch (e) {
        this.logger.warn(`向 Agent 发送通话记录失败: ${(e as Error).message}`);
      }
    }

    if (body.callId) {
      this.processedCallIds.add(body.callId);
    }

    return { text };
  }
}
