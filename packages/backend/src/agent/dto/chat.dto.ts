import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** Agent 对话请求体 */
export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  /** 可选；不传则由服务端创建新 thread */
  @IsOptional()
  @IsUUID()
  thread_id?: string;

  /** 当前页面向 Agent 暴露的前端工具名列表 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  available_tools?: string[];
}
