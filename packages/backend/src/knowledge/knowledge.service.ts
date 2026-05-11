import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
const pdfParse = require('pdf-parse');
import { IKnowledgeDao } from '../dao/interfaces/knowledge-dao.interface';
import { IRoleDao } from '../dao/interfaces/role-dao.interface';
import { KNOWLEDGE_DAO, ROLE_DAO } from '../dao/dao.tokens';
import { KnowledgeBase } from './knowledge-base.entity';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import {
  PaginatedResult,
  PaginationQuery,
} from '../dao/interfaces/base-dao.interface';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(KNOWLEDGE_DAO)
    private readonly knowledgeDao: IKnowledgeDao,
    @Inject(ROLE_DAO)
    private readonly roleDao: IRoleDao,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    dto: CreateKnowledgeDto,
  ): Promise<KnowledgeBase> {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }

    const originalName = file.originalname;
    const mimeType = file.mimetype;
    let textContent = '';

    try {
      if (
        mimeType === 'text/plain' ||
        mimeType === 'text/markdown' ||
        originalName.endsWith('.md')
      ) {
        textContent = file.buffer.toString('utf-8');
      } else if (mimeType === 'application/pdf') {
        const data = await pdfParse(file.buffer);
        textContent = data.text;
      } else {
        throw new BadRequestException(
          '不支持的文件类型。仅支持 .txt, .md, .pdf',
        );
      }
    } catch (e) {
      throw new BadRequestException(`解析文件失败: ${(e as Error).message}`);
    }

    // 1. 入库数据库
    const entityData: Partial<KnowledgeBase> = {
      name: dto.name || originalName,
      description: dto.description || '',
      fileName: originalName,
      fileType: mimeType,
      qdrantCollection: 'knowledge_base',
    };

    const entity = await this.knowledgeDao.create(entityData);

    // 2. 默认给个 admin 权限
    const roleIds: string[] = [];
    try {
      const adminRole = await this.roleDao.findByName('admin');
      if (adminRole) {
        await this.knowledgeDao.assignRoles(entity.id, [adminRole.id]);
        roleIds.push(adminRole.id);
        this.logger.log(`为新知识库文档 ${entity.id} 分配了默认 admin 权限`);
      }
    } catch (e) {
      this.logger.warn(`为知识库分配默认权限失败: ${(e as Error).message}`);
    }

    // 3. 通知 Agent 进行向量化（带上 ID 和 权限信息）
    try {
      const response = await fetch('http://127.0.0.1:8123/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: originalName,
          text: textContent,
          knowledge_base_id: entity.id,
          role_ids: roleIds,
        }),
      });

      if (!response.ok) {
        throw new InternalServerErrorException(
          `Agent 向量化入库失败: ${response.status}`,
        );
      } else {
        this.logger.log(
          `成功推送给 Agent 向量化: ${originalName} (ID: ${entity.id})`,
        );
      }
    } catch (e) {
      throw new InternalServerErrorException(
        `向 Agent 发送文件文本失败: ${(e as Error).message}`,
      );
    }

    return this.knowledgeDao.findById(entity.id);
  }

  async updateFile(
    id: string,
    file: Express.Multer.File,
    dto: CreateKnowledgeDto,
  ): Promise<KnowledgeBase> {
    // 1. 获取现有数据（为了拿到 role_ids）
    const existing = await this.knowledgeDao.findById(id);
    if (!existing) {
      throw new NotFoundException(`知识库文档 ${id} 不存在`);
    }

    const roleIds = existing.roles?.map((r) => r.id) || [];

    // 2. 更新数据库记录
    const updateData: Partial<KnowledgeBase> = {
      name: dto.name || existing.name,
      description: dto.description || existing.description,
    };

    // 3. 处理文件（如果有新文件则重新索引）
    if (file) {
      const originalName = file.originalname;
      const mimeType = file.mimetype;
      let textContent = '';

      try {
        if (
          mimeType === 'text/plain' ||
          mimeType === 'text/markdown' ||
          originalName.endsWith('.md')
        ) {
          textContent = file.buffer.toString('utf-8');
        } else if (mimeType === 'application/pdf') {
          const data = await pdfParse(file.buffer);
          textContent = data.text;
        } else {
          throw new BadRequestException(
            '不支持的文件类型。仅支持 .txt, .md, .pdf',
          );
        }
      } catch (e) {
        throw new BadRequestException(`解析文件失败: ${(e as Error).message}`);
      }

      updateData.fileName = originalName;
      updateData.fileType = mimeType;

      // 同步给 Agent（重新切片）
      try {
        const response = await fetch('http://127.0.0.1:8123/knowledge/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: originalName,
            text: textContent,
            knowledge_base_id: id,
            role_ids: roleIds,
          }),
        });

        if (!response.ok) {
          throw new InternalServerErrorException(
            `Agent 向量化更新失败: ${response.status}`,
          );
        } else {
          this.logger.log(`成功推送给 Agent 向量化更新: ${originalName} (ID: ${id})`);
        }
      } catch (e) {
        throw new InternalServerErrorException(
          `向 Agent 发送更新请求失败: ${(e as Error).message}`,
        );
      }
    }

    await this.knowledgeDao.update(id, updateData);

    return this.knowledgeDao.findById(id);
  }

  async findAll(
    query?: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeBase>> {
    return this.knowledgeDao.findAll(query);
  }

  async remove(id: string): Promise<void> {
    await this.knowledgeDao.delete(id);

    // 同步删除 Agent 中的向量数据
    try {
      const response = await fetch('http://127.0.0.1:8123/knowledge/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledge_base_id: id,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`同步删除 Agent 向量数据失败: ${response.status}`);
      } else {
        this.logger.log(`成功同步删除 Agent 向量数据: ${id}`);
      }
    } catch (e) {
      this.logger.warn(`同步删除 Agent 向量数据出错: ${(e as Error).message}`);
    }
  }

  async assignRoles(
    knowledgeBaseId: string,
    roleIds: string[],
  ): Promise<KnowledgeBase> {
    const result = await this.knowledgeDao.assignRoles(
      knowledgeBaseId,
      roleIds,
    );

    // 同步给 Agent
    try {
      const response = await fetch(
        'http://127.0.0.1:8123/knowledge/update-roles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            knowledge_base_id: knowledgeBaseId,
            role_ids: roleIds,
          }),
        },
      );

      if (!response.ok) {
        this.logger.warn(`同步权限给 Agent 失败: ${response.status}`);
      } else {
        this.logger.log(`成功同步权限给 Agent: ${knowledgeBaseId}`);
      }
    } catch (e) {
      this.logger.warn(`同步权限给 Agent 出错: ${(e as Error).message}`);
    }

    return result;
  }
}
