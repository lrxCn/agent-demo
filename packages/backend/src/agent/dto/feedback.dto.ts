import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FeedbackDto {
  @IsString()
  @IsNotEmpty()
  thread_id!: string;

  @IsString()
  @IsNotEmpty()
  langsmith_run_id!: string;

  @IsEnum(['up', 'down', 'note'])
  feedback!: 'up' | 'down' | 'note';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
