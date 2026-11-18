import { Module } from '@nestjs/common';
import { ResumeSourceModule } from '../resume-source/resume-source.module';
import { ResumesModule } from '../resumes/resumes.module';
import { AtsModelController, AtsReportsController, ResumeAtsController } from './ats-engine.controller';
import { AtsEngineService } from './ats-engine.service';

@Module({
  imports: [ResumesModule, ResumeSourceModule],
  controllers: [AtsModelController, ResumeAtsController, AtsReportsController],
  providers: [AtsEngineService],
  exports: [AtsEngineService],
})
export class AtsEngineModule {}
