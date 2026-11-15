import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ROLES } from '../role-taxonomy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const ROLE_IDS = ROLES.map((r) => r.id);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export const PLAN_STATUSES = ['ACTIVE', 'PAUSED', 'DONE'] as const;

export class AnalyzeDto {
  /** Omit to explore adjacent roles from your profile. */
  @IsOptional() @IsIn(ROLE_IDS) targetRoleId?: string;
}

export class CreatePlanDto {
  @IsIn(ROLE_IDS) roleId: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title?: string;
}

export class UpdatePlanDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title?: string;
  @IsOptional() @IsIn(PLAN_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
}

export class AddMilestoneDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @Matches(DATE_RE, { message: 'targetDate must be YYYY-MM-DD' }) targetDate?: string;
}

export class UpdateMilestoneDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'targetDate must be YYYY-MM-DD' }) targetDate?: string | null;
  @IsOptional() @IsIn(MILESTONE_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class CompensationQueryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) role: string;
  /** Country or region level only. City-level precision is not needed and is not accepted. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) location?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
}

export class PageQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(1000) page?: number;
}
