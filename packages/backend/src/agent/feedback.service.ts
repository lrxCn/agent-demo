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

interface LangSmithRunDetail {
  tags: string[];
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  trace_id?: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly config: ConfigService) {}

  /** 读 LangSmith Run 的 tags / inputs / outputs / 父 trace_id，路由 dataset 用 */
  private async fetchRun(runId: string): Promise<LangSmithRunDetail | null> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return null;
    }
    try {
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/runs/${runId}`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      });
      if (!resp.ok) {
        this.logger.warn(`LangSmith GET /runs/${runId} 失败 status=${resp.status}`);
        return null;
      }
      const data = (await resp.json()) as Record<string, unknown>;
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string')
        : [];
      const inputs =
        typeof data.inputs === 'object' && data.inputs !== null
          ? (data.inputs as Record<string, unknown>)
          : {};
      const outputs =
        typeof data.outputs === 'object' && data.outputs !== null
          ? (data.outputs as Record<string, unknown>)
          : {};
      const traceId = typeof data.trace_id === 'string' ? data.trace_id : undefined;
      return { tags, inputs, outputs, trace_id: traceId };
    } catch (e) {
      this.logger.warn(`fetchRun 异常: ${(e as Error).message}`);
      return null;
    }
  }

  /** 按 tags 路由到 dataset 名称（最后 fallback 到 bad_cases） */
  private routeDataset(tags: string[]): string {
    if (tags.includes('rag:miss')) {
      return (
        this.config.get<string>('LANGSMITH_DATASET_RAG_CASES') ||
        'plan2code-rag-cases-v1'
      );
    }
    if (tags.some((t) => t.startsWith('tool:') || t.startsWith('tool_'))) {
      return (
        this.config.get<string>('LANGSMITH_DATASET_TOOL_CASES') ||
        'plan2code-tool-cases-v1'
      );
    }
    return (
      this.config.get<string>('LANGSMITH_DATASET_BAD_CASES') ||
      'plan2code-bad-cases-v1'
    );
  }

  /** dataset 不存在时自动创建并返回 id；存在时返回已有 id */
  private async ensureDataset(name: string): Promise<string | null> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return null;
    }
    try {
      const listResp = await fetch(
        `${endpoint.replace(/\/$/, '')}/datasets?name=${encodeURIComponent(name)}`,
        { method: 'GET', headers: { 'x-api-key': apiKey } },
      );
      if (listResp.ok) {
        const listData = (await listResp.json()) as unknown;
        const list = Array.isArray(listData)
          ? listData
          : Array.isArray((listData as { datasets?: unknown[] })?.datasets)
            ? ((listData as { datasets: unknown[] }).datasets ?? [])
            : [];
        const first = list[0] as { id?: string } | undefined;
        if (first?.id) {
          return first.id;
        }
      }

      const createResp = await fetch(`${endpoint.replace(/\/$/, '')}/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          name,
          description: 'plan2code 自动收集的 bad case（用户 👎 反馈）',
        }),
      });
      if (!createResp.ok) {
        this.logger.warn(
          `LangSmith 创建 dataset=${name} 失败 status=${createResp.status}`,
        );
        return null;
      }
      const created = (await createResp.json()) as { id?: string };
      return created.id ?? null;
    } catch (e) {
      this.logger.warn(`ensureDataset 异常: ${(e as Error).message}`);
      return null;
    }
  }

  /** 把 run 转成 dataset example 并 POST 进去 */
  private async addRunToDataset(
    datasetId: string,
    runDetail: LangSmithRunDetail,
    feedbackComment: string | undefined,
  ): Promise<void> {
    const apiKey = this.config.get<string>('LANGSMITH_API_KEY');
    const endpoint = this.config.get<string>(
      'LANGCHAIN_ENDPOINT',
      'https://api.smith.langchain.com',
    );
    if (!apiKey) {
      return;
    }
    const example = {
      inputs: runDetail.inputs,
      outputs: runDetail.outputs,
      metadata: {
        source: 'user_thumb_down',
        tags: runDetail.tags,
        feedback_comment: feedbackComment ?? '',
      },
    };
    try {
      const resp = await fetch(
        `${endpoint.replace(/\/$/, '')}/datasets/${datasetId}/examples`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(example),
        },
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn(
          `LangSmith POST dataset example 失败 status=${resp.status} body=${text}`,
        );
      }
    } catch (e) {
      this.logger.warn(`addRunToDataset 异常: ${(e as Error).message}`);
    }
  }

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

      // 监控体系 Phase 7-3 Step 4：down 反馈 → 自动路由到 dataset
      if (dto.feedback === 'down') {
        try {
          const runDetail = await this.fetchRun(dto.langsmith_run_id);
          if (runDetail) {
            const datasetName = this.routeDataset(runDetail.tags);
            const datasetId = await this.ensureDataset(datasetName);
            if (datasetId) {
              await this.addRunToDataset(datasetId, runDetail, dto.comment);
              this.logger.log(
                JSON.stringify({
                  trace_id: TraceContext.getTraceId(),
                  user_id: user.id,
                  module: 'feedback',
                  level: 'info',
                  msg: 'bad case 已加入 dataset',
                  extra: {
                    run_id: dto.langsmith_run_id,
                    dataset: datasetName,
                  },
                }),
              );
            }
          }
        } catch (e) {
          // dataset 自动路由软失败，不影响主流程反馈成功返回
          this.logger.warn(`dataset 自动路由异常: ${(e as Error).message}`);
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
