import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { JwtUser } from '../auth/types/jwt-user.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('feedback')
  @HttpCode(200)
  async submit(
    @Body() dto: FeedbackDto,
    @CurrentUser() user: JwtUser,
  ): Promise<{ ok: true }> {
    await this.feedbackService.submit(dto, user);
    return { ok: true };
  }
}
