import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { ClippedJobsController, ExtensionSessionsController } from './job-clipper.controller';
import { JobClipperService } from './job-clipper.service';

@Module({ imports: [CareerProfileModule], controllers: [ClippedJobsController, ExtensionSessionsController], providers: [JobClipperService] })
export class JobClipperModule {}
