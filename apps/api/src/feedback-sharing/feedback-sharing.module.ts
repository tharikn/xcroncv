import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({ imports: [ResumeSourceModule], controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackSharingModule {}
