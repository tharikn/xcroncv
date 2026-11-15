import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, Max, Min, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** The resume reference is fixed at creation; it is deliberately absent from UpdateVaultEntryDto. */
export class CreateVaultEntryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) employerLabel: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) externalJobId?: string;
  @Matches(DATE_RE, { message: 'appliedOn must be YYYY-MM-DD' }) appliedOn: string;
  @IsUUID('all') resumeId: string;
  /** Omit to use the latest saved version. A working draft cannot be referenced: only immutable versions. */
  @IsOptional() @IsUUID('all') resumeVersionId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) coverLetterVersionRef?: string;
  @IsOptional() @IsIn(STAGES as unknown as string[]) stage?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'followUpOn must be YYYY-MM-DD' }) followUpOn?: string;
}

export class UpdateVaultEntryDto {
  @IsOptional() @IsIn(STAGES as unknown as string[]) stage?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'followUpOn must be YYYY-MM-DD' }) followUpOn?: string | null;
  @IsOptional() @IsBoolean() followUpDone?: boolean;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) coverLetterVersionRef?: string;
}

export class VaultQueryDto {
  @IsOptional() @IsString() @MaxLength(160) employer?: string;
  @IsOptional() @IsIn(STAGES as unknown as string[]) stage?: string;
  @IsOptional() @IsUUID('all') resumeId?: string;
}

export class SnoozeDto {
  @IsInt() @Min(1) @Max(60) days: number;
}
