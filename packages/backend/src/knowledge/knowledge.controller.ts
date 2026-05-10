import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('api/v1/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  @RequirePermissions('knowledge:view')
  async findAll(@Query() query: any) {
    const data = await this.knowledgeService.findAll(query);
    return { code: 0, data, message: 'ok' };
  }

  @Post('upload')
  @RequirePermissions('knowledge:create')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateKnowledgeDto,
  ) {
    const data = await this.knowledgeService.uploadFile(file, dto);
    return { code: 0, data, message: 'ok' };
  }

  @Delete(':id')
  @RequirePermissions('knowledge:delete')
  async remove(@Param('id') id: string) {
    await this.knowledgeService.remove(id);
    return { code: 0, data: null, message: 'ok' };
  }
}
