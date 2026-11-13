import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';

@Module({ imports: [TemplatesModule], controllers: [ResumesController], providers: [ResumesService] })
export class ResumesModule {}
