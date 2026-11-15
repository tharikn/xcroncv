import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { RecruiterViewController } from './recruiter-view.controller';
import { RecruiterViewService } from './recruiter-view.service';

@Module({ imports: [ResumeSourceModule], controllers: [RecruiterViewController], providers: [RecruiterViewService] })
export class RecruiterViewModule {}
