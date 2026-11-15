import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_ANSWER_CHARS } from '../copilot-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSessionDto {
  @IsUUID('all') resumeId: string;
  @IsInt() @Min(1) versionNumber: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) jobTitle: string;
  /** Used once to extract requirement terms. The raw text is not stored. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20000) jobDescription?: string;
  /** Keep my answer text after feedback. Off by default. */
  @IsBoolean() retainAnswers: boolean;
  /** Practice only: the user understands this is rehearsal and not live assistance. */
  @IsBoolean() confirmPracticeOnly: boolean;
}

export class AnswerDto {
  @IsString() @MaxLength(40) questionId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(MAX_ANSWER_CHARS) text: string;
}

export class ConsentDto { @IsBoolean() retainAnswers: boolean }
