import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { DISCLOSURE_FIELDS, KINDS, PROFILE_ITEM_TYPES, PURPOSES } from '../credential-logic';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const DATE_MSG = 'must be YYYY-MM or YYYY-MM-DD';
const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCredentialDto {
  @IsOptional() @IsIn(KINDS as unknown as string[]) kind?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) name: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) issuer: string;
  @IsOptional() @Matches(DATE_RE, { message: `issuedOn ${DATE_MSG}` }) issuedOn?: string;
  @IsOptional() @Matches(DATE_RE, { message: `expiresOn ${DATE_MSG}` }) expiresOn?: string;
  /** Stored encrypted; only the last four characters are ever shown. */
  @IsOptional() @IsString() @MaxLength(120) credentialId?: string;
  @IsOptional() @IsUrl(URL_OPTS) @MaxLength(500) verificationUrl?: string;
}

export class UpdateCredentialDto {
  @IsOptional() @IsIn(KINDS as unknown as string[]) kind?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) issuer?: string;
  @IsOptional() @Matches(DATE_RE, { message: `issuedOn ${DATE_MSG}` }) issuedOn?: string | null;
  @IsOptional() @Matches(DATE_RE, { message: `expiresOn ${DATE_MSG}` }) expiresOn?: string | null;
  /** Empty string clears the stored identifier. */
  @IsOptional() @IsString() @MaxLength(120) credentialId?: string;
  @IsOptional() @IsUrl(URL_OPTS) @MaxLength(500) verificationUrl?: string | null;
}

export class AddEvidenceDto {
  @IsIn(['LINK', 'PROFILE_ITEM', 'LOCAL_NOTE']) kind: 'LINK' | 'PROFILE_ITEM' | 'LOCAL_NOTE';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) label: string;
  @IsOptional() @IsUrl(URL_OPTS) @MaxLength(500) url?: string;
  @IsOptional() @IsIn(PROFILE_ITEM_TYPES as unknown as string[]) profileItemType?: string;
  @IsOptional() @IsUUID('all') profileItemId?: string;
}

export class VerificationRequestDto {
  /** Verification is only attempted with the owner's explicit consent. */
  @IsBoolean() consent: boolean;
  /** SELF_DOCUMENT_REVIEW: you reviewed the original yourself. PROVIDER: ask a connected issuer/provider. */
  @IsIn(['SELF_DOCUMENT_REVIEW', 'PROVIDER']) method: 'SELF_DOCUMENT_REVIEW' | 'PROVIDER';
  @IsOptional() @IsString() @MaxLength(60) provider?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CreateGrantDto {
  @IsIn(PURPOSES as unknown as string[]) purpose: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) recipientLabel?: string;
  @ArrayMinSize(1) @ArrayMaxSize(DISCLOSURE_FIELDS.length) @ArrayUnique() @IsIn(DISCLOSURE_FIELDS as unknown as string[], { each: true }) fields: string[];
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
  /** Nothing is disclosed by default; the owner confirms each grant. */
  @IsBoolean() confirm: boolean;
}
