import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { AiModule } from '../ai/ai.module';
import { JdResumeGeneratorController } from './jd-resume-generator.controller';
import { JdResumeGeneratorService } from './jd-resume-generator.service';

@Module({
  imports: [CareerProfileModule, AiModule],
  controllers: [JdResumeGeneratorController],
  providers: [JdResumeGeneratorService],
  exports: [JdResumeGeneratorService],
})
export class JdResumeGeneratorModule {}
