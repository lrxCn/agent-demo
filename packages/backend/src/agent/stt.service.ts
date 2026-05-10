import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface SiliconFlowTranscribeResponse {
  text?: string;
}

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(audioBuffer: Buffer, filename: string): Promise<string> {
    const baseUrl = this.config.get<string>('OPENAI_BASE_URL')?.trim();
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!baseUrl || !apiKey) {
      throw new InternalServerErrorException(
        '缺少 STT 配置，请检查 OPENAI_BASE_URL 与 OPENAI_API_KEY',
      );
    }

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), filename);
    formData.append('model', 'FunAudioLLM/SenseVoiceSmall');

    try {
      const { data } = await axios.post<SiliconFlowTranscribeResponse>(
        `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 60_000,
        },
      );
      const text = data?.text?.trim() ?? '';
      if (!text) {
        throw new InternalServerErrorException('语音转写结果为空');
      }
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`调用 STT 失败: ${message}`);
      throw new InternalServerErrorException(`语音转写失败: ${message}`);
    }
  }
}
