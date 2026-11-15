import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_DESCRIPTION } from '../clip-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateClipDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) company: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) url?: string;
  @Transform(trim) @IsString() @MinLength(20, { message: 'description is too short to analyse' }) @MaxLength(MAX_DESCRIPTION * 2) description: string;
  @IsIn(['MANUAL', 'EXTENSION']) source: 'MANUAL' | 'EXTENSION';
  /** The user reviewed and corrected these fields before sending. Nothing is stored without it. */
  @IsBoolean() reviewed: boolean;
  @IsOptional() @IsString() @MaxLength(80) idempotencyKey?: string;
  @IsOptional() @IsUUID('all') sessionId?: string;
}

export class UpdateClipDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) company?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) url?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(20) @MaxLength(MAX_DESCRIPTION * 2) description?: string;
  @IsOptional() @IsIn(['NEW', 'REVIEWED', 'ARCHIVED']) status?: string;
}

export class CreateSessionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) label: string;
}

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}
