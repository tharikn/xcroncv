import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AI_TASKS } from '../ai.types';
import { MAX_INPUT_CHARS } from '../ai-policy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SetAiSettingsDto {
  /** Turning AI on is the user's consent to send redacted, minimal text to the configured provider. */
  @IsBoolean() enabled: boolean;
}

export class AiContextDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60) years?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true }) skills?: string[];
}

export class CreateSuggestionDto {
  @IsIn(AI_TASKS as unknown as string[]) task: (typeof AI_TASKS)[number];
  @Transform(trim) @IsString() @MaxLength(MAX_INPUT_CHARS) text: string;
  @IsOptional() @ValidateNested() @Type(() => AiContextDto) context?: AiContextDto;
}

export class DecideSuggestionDto {
  @IsIn(['ACCEPT', 'REJECT']) decision: 'ACCEPT' | 'REJECT';
  /** Accepting needs an explicit confirmation; the text is returned to the user to apply, never written to the profile. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}
