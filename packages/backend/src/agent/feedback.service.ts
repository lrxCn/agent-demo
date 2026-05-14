import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtUser } from '../auth/types/jwt-user.types';
import { TraceContext } from '../common/context/trace-context';
import { FeedbackDto } from './dto/feedback.dto';

interface LangSmithFeedbackPayload {
  run_id: string;
  key: string;
  score?: number;
  value?: string;
  comment?: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly config: ConfigService) {}

  async submit(dto: FeedbackDto, user: JwtUser): Promise<void> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      throw new HttpException(
        'LangSmith 未配置 API key',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const traceId = TraceContext.getTraceId();
    this.logger.log(
      JSON.stringify({
        trace_id: traceId,
        user_id: user.id,
        thread_id: dto.thread_id,
        module: 'feedback',
        level: 'info',
        msg: '反馈提交',
        extra: {
          run_id: dto.langsmith_run_id,
          feedback: dto.feedback,
          has_comment: Boolean(dto.comment),
        },
      }),
    );

    // 监控体系：把 up=1 / down=0 / note 单独 score=null
    const score: number | undefined =
      dto.feedback === 'up' ? 1 : dto.feedback === 'down' ? 0 : undefined;
    const value: string | undefined =
      dto.feedback === 'note' ? 'note' : undefined;

    const payload: LangSmithFeedbackPayload = {
      run_id: dto.langsmith_run_id,
      key: 'user_feedback',
      ...(score !== undefined ? { score } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(dto.comment ? { comment: dto.comment } : {}),
    };

    const feedbackUrl = `${endpoint.replace(/\/$/, '')}/feedback`;
    const tagsUrl = `${endpoint.replace(/\/$/, '')}/runs/${dto.langsmith_run_id}`;

    try {
      // 1. POST /feedback：写入分值
      const feedbackResp = await fetch(feedbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!feedbackResp.ok) {
        const text = await feedbackResp.text().catch(() => '');
        throw new Error(
          `LangSmith /feedback 失败 status=${feedbackResp.status} body=${text}`,
        );
      }

      // 2. PATCH /runs/{id}：追加 tag（feedback:up / feedback:down）
      if (dto.feedback !== 'note') {
        const tagsResp = await fetch(tagsUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            tags: [`feedback:${dto.feedback}`],
          }),
        });
        if (!tagsResp.ok) {
          // 打日志但不阻塞主流程（反馈分值已写成功）
          const text = await tagsResp.text().catch(() => '');
          this.logger.warn(
            `LangSmith /runs/${dto.langsmith_run_id} PATCH tag 失败 status=${tagsResp.status} body=${text}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(
        `提交反馈到 LangSmith 失败: ${(e as Error).message}`,
        e instanceof Error ? e.stack : undefined,
      );
      throw new HttpException(
        '反馈提交失败，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
