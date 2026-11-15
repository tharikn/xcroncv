import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { JobPortalController } from './job-portal.controller';
import { JobPortalService } from './job-portal.service';

@Module({ imports: [CareerProfileModule], controllers: [JobPortalController], providers: [JobPortalService] })
export class JobPortalModule {}
