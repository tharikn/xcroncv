import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { ExpertReviewController } from './expert-review.controller';
import { NotConfiguredPaymentProvider, PAYMENT_PROVIDER } from './expert-review-logic';
import { ExpertReviewService } from './expert-review.service';

/** Doc 50 (FEATURES_DISABLED=expert-review). Swap the PAYMENT_PROVIDER binding to add a real provider. */
@Module({
  imports: [ResumeSourceModule], controllers: [ExpertReviewController],
  providers: [ExpertReviewService, { provide: PAYMENT_PROVIDER, useClass: NotConfiguredPaymentProvider }],
})
export class ExpertReviewModule {}
