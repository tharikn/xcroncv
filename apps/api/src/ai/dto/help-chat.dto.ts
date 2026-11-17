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
}
