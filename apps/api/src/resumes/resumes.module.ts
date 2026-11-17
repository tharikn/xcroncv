import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { PublicResumeController, ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';

@Module({ imports: [TemplatesModule], controllers: [ResumesController, PublicResumeController], providers: [ResumesService], exports: [ResumesService] })
export class ResumesModule {}
