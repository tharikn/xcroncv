import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
/** Only for health/readiness and the token-addressed public portfolio view (doc 41). Other routes must never be public. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
