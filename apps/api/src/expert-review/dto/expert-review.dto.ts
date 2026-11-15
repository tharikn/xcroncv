import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SECTION_KEYS } from '../expert-review-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const VIS = ['visible', 'hidden'];

export class ContactScopeDto {
  @IsIn(VIS) email: 'visible' | 'hidden';
  @IsIn(VIS) phone: 'visible' | 'hidden';
  @IsIn(VIS) location: 'visible' | 'hidden';
}

export class CreateReviewDto {
  @IsUUID('all') resumeId: string;
  /** Omit for the latest saved version. Only an immutable saved version can be reviewed, never the working draft. */
  @IsOptional() @IsUUID('all') resumeVersionId?: string;
  @IsString() @MaxLength(60) reviewerId: string;
  @IsString() @MaxLength(60) packageId: string;
  @ArrayMinSize(1) @ArrayMaxSize(SECTION_KEYS.length) @ArrayUnique() @IsIn(SECTION_KEYS as unknown as string[], { each: true }) sections: string[];
  @ValidateNested() @Type(() => ContactScopeDto) contacts: ContactScopeDto;
  @IsOptional() @IsIn(VIS) links?: 'visible' | 'hidden';
  @IsInt() @Min(1) @Max(30) expiresInDays: number;
  /** Nothing is shared by default; the candidate must explicitly consent to this exact scope. */
  @IsBoolean() consent: boolean;
}

export class GrantDto {
  @IsInt() @Min(1) @Max(30) expiresInDays: number;
  @IsBoolean() consent: boolean;
}

export class RecordFeedbackDto {
  /** A section key from the granted scope; omit for overall comments. */
  @IsOptional() @IsIn(SECTION_KEYS as unknown as string[]) section?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) clarity?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) relevance?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) evidence?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) presentation?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) comment?: string;
}

export class DecideDto {
  @IsIn(['ACCEPTED', 'DECLINED']) decision: 'ACCEPTED' | 'DECLINED';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}
