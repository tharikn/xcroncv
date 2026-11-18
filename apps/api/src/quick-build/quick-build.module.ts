import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { TemplatesModule } from '../templates/templates.module';
import { ContentOptimizer } from './content-optimizer';
import { QuickBuildController } from './quick-build.controller';
import { QuickBuildService } from './quick-build.service';

@Module({
  imports: [CareerProfileModule, TemplatesModule, AiModule],
  controllers: [QuickBuildController],
  providers: [QuickBuildService, ContentOptimizer],
  exports: [QuickBuildService],
})
export class QuickBuildModule {}
