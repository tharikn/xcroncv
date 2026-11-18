import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HelpChatContext } from '../help/help-chat.types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class HelpChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(800)
  content!: string;
}

/**
 * Resume-scoped context for the assistant. Declared before `HelpChatDto` because TypeScript emits
 * the property's `design:type` metadata eagerly: a class referenced before its declaration throws
 * "Cannot access ... before initialization" when the module is required.
 */
export class HelpChatContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resumeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionId?: string;
}

/**
 * In-app assistant message. History is client-side only; the server never stores chat text.
 * Length caps mirror AI_HELP_MAX_MESSAGE_CHARS / AI_HELP_MAX_HISTORY_TURNS defaults.
 */
export class HelpChatDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => HelpChatTurnDto)
  history?: HelpChatTurnDto[];

  /** Resume-scoped context for content checks (quality score, mistakes, sentence fixes, ATS corrections). */
  @IsOptional()
  @ValidateNested({ each: false })
  @Type(() => HelpChatContextDto)
  context?: HelpChatContextDto;
}
