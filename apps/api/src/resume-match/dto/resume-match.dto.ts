import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { REQUIREMENT_TYPES } from '../jd-analyzer';

export class CreateJobDescriptionDto {
  @IsString() @MinLength(1) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  /** The pasted posting. Treated as untrusted text. Stored only if retainRawText is true. */
  @IsString() @MinLength(20) @MaxLength(30000) text: string;
  @IsOptional() @IsBoolean() retainRawText?: boolean;
}

export class ImportUrlDto {
  @IsString() @MinLength(8) @MaxLength(2048) url: string;
  @IsOptional() @IsBoolean() retainRawText?: boolean;
}

export class RequirementDto {
  @IsOptional() @IsString() @MaxLength(60) id?: string;
  @IsEnum(REQUIREMENT_TYPES) type: (typeof REQUIREMENT_TYPES)[number];
  @IsString() @MinLength(1) @MaxLength(200) label: string;
  @IsOptional() @IsBoolean() included?: boolean;
  @IsOptional() @IsBoolean() explicit?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(50) minYears?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(40, { each: true }) alternatives?: string[];
  /** Accepted for round-tripping; recomputed on the server and never trusted. */
  @IsOptional() @IsString() @MaxLength(60) normalized?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) degreeLevel?: number;
  @IsOptional() @IsString() @MaxLength(220) sourceText?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
  @IsOptional() @IsEnum(['EXTRACTED', 'USER']) origin?: 'EXTRACTED' | 'USER';
}

export class UpdateJobDescriptionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => RequirementDto) requirements?: RequirementDto[];
  /** The user confirms the (possibly edited) requirements. Editing without confirming resets to UNCONFIRMED. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CreateMatchReportDto {
  @IsUUID() jobDescriptionId: string;
  /** Exact saved resume version; omit to score the current working draft (recorded as such). */
  @IsOptional() @IsUUID() resumeVersionId?: string;
  @IsOptional() @IsString() @MaxLength(20) scoringVersion?: string;
}
