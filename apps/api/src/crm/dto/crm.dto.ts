import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

export const RELATIONSHIPS = ['RECRUITER', 'REFERRER', 'HIRING_MANAGER', 'PEER', 'MENTOR', 'OTHER'];
export const ACTIVITY_TYPES = ['OUTREACH', 'REFERRAL_REQUEST', 'RECRUITER_CALL', 'INTERVIEW_FOLLOW_UP', 'THANK_YOU', 'MEETING', 'NOTE'];
export const TASK_STATUSES = ['OPEN', 'DONE', 'CANCELLED'];
const REF = /^[\w.:-]{1,120}$/;

export class ChannelDto {
  @IsEnum(['email', 'phone', 'linkedin', 'other']) type: 'email' | 'phone' | 'linkedin' | 'other';
  @IsString() @MinLength(1) @MaxLength(200) value: string;
}

export class CreateContactDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(120) organization?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsEnum(RELATIONSHIPS) relationship?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ChannelDto) channels?: ChannelDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateContactDto extends PartialType(CreateContactDto) {}

export class CreateLinkDto {
  @IsEnum(['JOB', 'APPLICATION']) kind: 'JOB' | 'APPLICATION';
  @Matches(REF) externalRef: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class CreateActivityDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsEnum(ACTIVITY_TYPES) type: string;
  @IsDateString() occurredAt: string;
  @IsString() @MinLength(1) @MaxLength(500) summary: string;
  @IsOptional() @Matches(REF) externalRef?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsEnum(ACTIVITY_TYPES) type?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) summary?: string;
}

export class CreateTaskDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsDateString() dueAt: string;
  @IsOptional() @Matches(REF) externalRef?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(TASK_STATUSES) status?: string;
}

/** Consent-gated CSV import. The text is parsed in memory and never stored; only confirmed new contacts are saved. */
export class ImportContactsDto {
  @IsString() @MinLength(1) @MaxLength(90_000) csv: string;
  /** Must be true: the user confirms these are contacts they are entitled to keep, and nothing is enriched or messaged. */
  @IsBoolean() consent: boolean;
}
