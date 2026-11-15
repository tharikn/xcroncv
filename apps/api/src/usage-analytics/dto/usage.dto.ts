import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { EXPORT_FORMATS, FAILURE_CATEGORIES, PLATFORMS, USAGE_EVENTS } from '../usage-aggregate';

const REF = /^[\w.:-]{1,120}$/;

/** Strict allowlist: unknown properties are rejected by the global whitelist/forbid validation pipe. */
export class UsageEventDto {
  @Matches(REF) eventId: string;
  @IsEnum(USAGE_EVENTS) name: string;
  @IsDateString() occurredAt: string;
  @IsEnum(PLATFORMS) platform: string;
  @IsOptional() @Matches(REF) sessionId?: string;
  @IsOptional() @IsString() @MaxLength(20) appVersion?: string;
  @IsOptional() @Matches(REF) templateId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) templateVersion?: number;
  @IsOptional() @Matches(REF) resumeId?: string;
  @IsOptional() @IsEnum(EXPORT_FORMATS) exportFormat?: string;
  @IsOptional() @IsEnum(['OK', 'FAILED']) status?: string;
  @IsOptional() @IsEnum(FAILURE_CATEGORIES) failureCategory?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3_600_000) durationMs?: number;
}
export class RecordUsageDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => UsageEventDto) events: UsageEventDto[];
}
export class UsageQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(PLATFORMS) platform?: string;
  @IsOptional() @Matches(REF) templateId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) templateVersion?: number;
  @IsOptional() @IsEnum(EXPORT_FORMATS) exportFormat?: string;
  @IsOptional() @IsEnum(USAGE_EVENTS) feature?: string;
}
