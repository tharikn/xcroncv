import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { ResumesModule } from '../resumes/resumes.module';
import { JobDescriptionsController, MatchReportsController, ResumeMatchController } from './resume-match.controller';
import { ResumeMatchService } from './resume-match.service';

@Module({
  imports: [ResumesModule, ResumeSourceModule],
  controllers: [JobDescriptionsController, ResumeMatchController, MatchReportsController],
  providers: [ResumeMatchService],
})
export class ResumeMatchModule {}
