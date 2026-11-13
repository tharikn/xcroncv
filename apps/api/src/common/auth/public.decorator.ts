import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
/** Only for health/readiness. Resume Builder routes must never be public. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
