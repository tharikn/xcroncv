import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export const KINDS = ['concise', 'standard', 'career-change', 'referral'];
export const TONES = ['professional', 'warm', 'direct'];
export const LENGTHS = ['short', 'medium', 'long'];

export class CreateDraftDto {
  @IsString() @MinLength(1) @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsEnum(KINDS) kind?: string;
  @IsOptional() @IsEnum(TONES) tone?: string;
  @IsOptional() @IsEnum(LENGTHS) length?: string;
  @IsOptional() @IsUUID() resumeId?: string;
  @IsOptional() @IsString() @MaxLength(80) referrerName?: string;
  /** Used transiently for keyword matching; never stored or logged. */
  @IsOptional() @IsString() @MaxLength(20000) jdText?: string;
}

export class SectionDto {
  @IsString() @MaxLength(40) id: string;
  @IsString() @MaxLength(80) heading: string;
  @IsString() @MaxLength(5000) text: string;
  @IsEnum(['GENERATED', 'USER']) origin: 'GENERATED' | 'USER';
}

export class CreateLetterVersionDto {
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SectionDto) sections: SectionDto[];
  @IsOptional() @IsString() @MaxLength(200) changeSummary?: string;
  /** Text the candidate typed themselves (e.g. a referrer name): labelled, not flagged. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) userAuthored?: string[];
}

export class ValidateClaimsDto {
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SectionDto) sections: SectionDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) userAuthored?: string[];
}

export class BindDto {
  @IsUUID() coverLetterId: string;
  @IsInt() @Min(1) versionNumber: number;
  @IsOptional() @IsUUID() resumeVersionId?: string;
  /** Explicit user approval is required before a binding is created. */
  @IsBoolean() confirm: boolean;
}

export class UpdateLetterDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) title?: string;
}
