import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { ResumesModule } from '../resumes/resumes.module';
import { QualityReviewsController, ResumeQualityController } from './quality-review.controller';
import { QualityReviewService } from './quality-review.service';

@Module({
  imports: [ResumesModule, ResumeSourceModule],
  controllers: [ResumeQualityController, QualityReviewsController],
  providers: [QualityReviewService],
  exports: [QualityReviewService],
})
export class QualityReviewModule {}
