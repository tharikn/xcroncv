import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { SECTION_KEYS } from '../feedback-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const VIS = ['visible', 'hidden'];

export class ContactVisibilityDto {
  @IsIn(VIS) email: 'visible' | 'hidden';
  @IsIn(VIS) phone: 'visible' | 'hidden';
  @IsIn(VIS) location: 'visible' | 'hidden';
}

export class CreateShareDto {
  @IsUUID('all') resumeId: string;
  /** Omit for the latest saved version. Only an immutable saved version can be shared, never the working draft. */
  @IsOptional() @IsUUID('all') resumeVersionId?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) recipientLabel: string;
  @ArrayMinSize(1) @ArrayUnique() @IsIn(SECTION_KEYS as unknown as string[], { each: true }) sections: string[];
  @ValidateNested() @Type(() => ContactVisibilityDto) contacts: ContactVisibilityDto;
  @IsOptional() @IsIn(VIS) links?: 'visible' | 'hidden';
  @IsInt() @Min(1) @Max(90) expiresInDays: number;
  /** Sharing is private by default; the owner must explicitly confirm each share. */
  @IsBoolean() consent: boolean;
}

export class LogFeedbackDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) clarity?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) relevance?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) evidence?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) presentation?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) comment?: string;
}

export class DecideFeedbackDto {
  @IsIn(['ACCEPTED', 'DECLINED']) decision: 'ACCEPTED' | 'DECLINED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** The new resume version you created from this feedback (must be yours and newer than the shared one). */
  @IsOptional() @IsInt() @Min(1) appliedVersionNumber?: number;
}
