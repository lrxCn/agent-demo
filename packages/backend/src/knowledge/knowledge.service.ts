import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
const pdfParse = require('pdf-parse');
import { IKnowledgeDao } from '../dao/interfaces/knowledge-dao.interface';
import { KNOWLEDGE_DAO } from '../dao/dao.tokens';
import { KnowledgeBase } from './knowledge-base.entity';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { PaginatedResult, PaginationQuery } from '../dao/interfaces/base-dao.interface';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(KNOWLEDGE_DAO)
    private readonly knowledgeDao: IKnowledgeDao,
  ) {}

  async uploadFile(file: Express.Multer.File, dto: CreateKnowledgeDto): Promise<KnowledgeBase> {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }

    const originalName = file.originalname;
    const mimeType = file.mimetype;
    let textContent = '';

    try {
      if (mimeType === 'text/plain' || mimeType === 'text/markdown' || originalName.endsWith('.md')) {
        textContent = file.buffer.toString('utf-8');
      } else if (mimeType === 'application/pdf') {
        const data = await pdfParse(file.buffer);
        textContent = data.text;
      } else {
        throw new BadRequestException('不支持的文件类型。仅支持 .txt, .md, .pdf');
      }
    } catch (e) {
      throw new BadRequestException(`解析文件失败: ${(e as Error).message}`);
    }

    // 预留与 Agent 通信的逻辑
    try {
      const response = await fetch('http://127.0.0.1:8123/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: originalName,
          text: textContent,
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Agent 向量化入库返回状态异常: ${response.status}`);
      } else {
        this.logger.log(`成功推送给 Agent 向量化: ${originalName}`);
      }
    } catch (e) {
      this.logger.warn(`向 Agent 发送文件文本失败: ${(e as Error).message}`);
    }

    // 入库
    const entityData: Partial<KnowledgeBase> = {
      name: dto.name || originalName,
      description: dto.description || '',
      fileName: originalName,
      fileType: mimeType,
      qdrantCollection: 'default_collection', // 后续可在 Agent 中动态生成
    };

    return this.knowledgeDao.create(entityData);
  }

  async findAll(query?: PaginationQuery): Promise<PaginatedResult<KnowledgeBase>> {
    return this.knowledgeDao.findAll(query);
  }

  async remove(id: string): Promise<void> {
    await this.knowledgeDao.delete(id);
  }

  async assignRoles(knowledgeBaseId: string, roleIds: string[]): Promise<KnowledgeBase> {
    // 根据当前数据库设计，knowledge_base_roles 为多对多关系。
    // 但是 DAO 层中没有暴露 assignRoles 的方法，如果需要我们可以稍后在 DAO 中实现，或直接利用 TypeORM Repo
    // 此处预留，因为知识库权限通常较复杂
    throw new Error('未实现');
  }
}
