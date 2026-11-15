import { Module } from '@nestjs/common';
import { ResumesModule } from '../resumes/resumes.module';
import { ResumeSourceService } from './resume-source.service';

@Module({ imports: [ResumesModule], providers: [ResumeSourceService], exports: [ResumeSourceService] })
export class ResumeSourceModule {}
