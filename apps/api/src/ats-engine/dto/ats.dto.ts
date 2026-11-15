import { IsOptional, IsUUID } from 'class-validator';

export class RunAtsDto {
  /** Posting the resume is scored against (owner-checked). Requirements come from the stored, user-reviewed job description. */
  @IsUUID() jobDescriptionId: string;
  /** Exact saved resume version; omit to score the current working draft. */
  @IsOptional() @IsUUID() resumeVersionId?: string;
}
