import { IsOptional, IsUUID } from 'class-validator';

export class RunQualityReviewDto {
  /** Exact saved resume version; omit to review the current working draft. */
  @IsOptional() @IsUUID() resumeVersionId?: string;
}
