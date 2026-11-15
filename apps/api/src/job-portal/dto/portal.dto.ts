import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpsertJobContextDto {
  /** Opaque host identifiers. They identify the record in the host portal and never grant access. */
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, { message: 'hostId must be a short lowercase slug' }) hostId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) externalId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) company: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) location?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) applyUrl?: string;
  @Transform(trim) @IsString() @MinLength(20) @MaxLength(40000) description: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true }) requirements?: string[];
  /** The user (or the host acting for them with their consent) is sending this job into their own account. */
  @IsBoolean() consent: boolean;
}

export class CreateProposalDto { @IsUUID('all') resumeId: string }

export class DecisionDto {
  @IsString() @MaxLength(20) itemId: string;
  @IsIn(['ACCEPT', 'REJECT']) decision: 'ACCEPT' | 'REJECT';
}

export class RecordApplicationDto {
  @IsUUID('all') jobContextId: string;
  @IsUUID('all') resumeId: string;
  @IsInt() @Min(1) versionNumber: number;
  @IsOptional() @IsUUID('all') proposalId?: string;
  /** Recording which version you used is your own bookkeeping; the portal still owns the application. */
  @IsBoolean() confirm: boolean;
}

export class UpdateApplicationDto { @Transform(trim) @IsString() @MaxLength(40) hostStatus: string }
