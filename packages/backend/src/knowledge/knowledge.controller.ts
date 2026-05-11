import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

/** 路径不含 `api/v1`，由 `main.ts` 的 `setGlobalPrefix('api/v1')` 统一前缀 */
@Controller('knowledge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post(':id/roles')
  @RequirePermissions('knowledge:manage')
  async assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    this.logger.log(`分配角色: id=${id}, roles=${JSON.stringify(dto.roleIds)}`);
    return this.knowledgeService.assignRoles(id, dto.roleIds);
  }

  @Get()
  @RequirePermissions('knowledge:view')
  async findAll(@Query() query: any) {
    return this.knowledgeService.findAll(query);
  }

  @Post('upload')
  @RequirePermissions('knowledge:create')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateKnowledgeDto,
  ) {
    return this.knowledgeService.uploadFile(file, dto);
  }

  @Delete(':id')
  @RequirePermissions('knowledge:delete')
  async remove(@Param('id') id: string) {
    await this.knowledgeService.remove(id);
  }
}
