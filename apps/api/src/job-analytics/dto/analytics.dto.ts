import { Type } from 'class-transformer';
import { Equals, ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { EVENT_TYPES } from '../aggregate';

const REF = /^[\w.:-]{1,120}$/;

export class EventDto {
  @IsEnum(EVENT_TYPES) type: string;
  @IsDateString() occurredAt: string;
  @Matches(REF) applicationRef: string;
  @IsOptional() @IsEnum(['MANUAL', 'HOST']) source?: 'MANUAL' | 'HOST';
  @IsOptional() @IsString() @MaxLength(60) roleFamily?: string;
  @IsOptional() @IsString() @MaxLength(60) geography?: string;
  @IsOptional() @IsString() @MaxLength(40) seniority?: string;
  @IsOptional() @IsString() @MaxLength(60) sourceName?: string;
  @IsOptional() @Matches(REF) resumeVersionId?: string;
  /** Makes retries safe: the same key never creates a second event. */
  @IsOptional() @Matches(REF) idempotencyKey?: string;
}

export class RecordEventsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EventDto) events: EventDto[];
}

/** Query filters shared by all read endpoints. */
export class AnalyticsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(60) roleFamily?: string;
  @IsOptional() @IsString() @MaxLength(60) geography?: string;
  @IsOptional() @IsString() @MaxLength(40) seniority?: string;
  @IsOptional() @IsString() @MaxLength(60) sourceName?: string;
}

export class DeleteEventsQuery {
  /** Must be the literal string "true"; guards against accidental wipes. */
  @IsEnum(['true']) confirm: string;
  @IsOptional() @Matches(REF) applicationRef?: string;
}

/** Ingestion pulls data in on the user's behalf, so it needs an explicit yes. */
export class ConfirmIngestDto {
  @Equals(true, { message: 'Confirm that you want to build events from this source' }) confirm: boolean;
}
