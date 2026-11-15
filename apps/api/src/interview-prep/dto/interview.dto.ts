import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePrepDto {
  @IsUUID('all') resumeId: string;
  /** Omit to ground in the working draft; pass a saved version to prepare from the exact version you sent. */
  @IsOptional() @IsUUID('all') resumeVersionId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) title?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) roleTitle?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(60, { each: true }) focusSkills?: string[];
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @MaxLength(4000) answer?: string;
  @IsOptional() @IsBoolean() practiced?: boolean;
}

export class AnswerFeedbackDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) answer: string;
}
