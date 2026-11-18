import { Module } from '@nestjs/common';
import { featureEnabled } from '../common/features';
import { QualityReviewModule } from '../quality-review/quality-review.module';
import { AtsEngineModule } from '../ats-engine/ats-engine.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './ai.types';
import { providerFromEnv } from './providers';
import { HelpChatService } from './help/help-chat.service';

/** Exports AiService so other modules can request suggestions through the same policy gateway. */
@Module({
  imports: [
    ...(featureEnabled('quality-review') ? [QualityReviewModule] : []),
    ...(featureEnabled('ats-engine') ? [AtsEngineModule] : []),
  ],
  controllers: [AiController],
  providers: [AiService, HelpChatService, { provide: AI_PROVIDER, useFactory: () => providerFromEnv() }],
  exports: [AiService, HelpChatService],
})
export class AiModule {}
