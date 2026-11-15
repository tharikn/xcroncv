import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({ imports: [ResumeSourceModule], controllers: [InterviewController], providers: [InterviewService] })
export class InterviewPrepModule {}
