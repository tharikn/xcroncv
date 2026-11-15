import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './ai.types';
import { providerFromEnv } from './providers';

/** Exports AiService so other modules can request suggestions through the same policy gateway. */
@Module({
  controllers: [AiController],
  providers: [AiService, { provide: AI_PROVIDER, useFactory: () => providerFromEnv() }],
  exports: [AiService],
})
export class AiModule {}
