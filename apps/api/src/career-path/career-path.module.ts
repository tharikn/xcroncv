import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { CareerPathController, CompensationController } from './career-path.controller';
import { CareerPathService } from './career-path.service';
import { COMPENSATION_PROVIDERS } from './compensation';

@Module({
  imports: [CareerProfileModule],
  controllers: [CareerPathController, CompensationController],
  providers: [
    CareerPathService,
    // No licensed compensation source is integrated (doc 44 P2 needs licensing review). Register adapters here.
    { provide: COMPENSATION_PROVIDERS, useValue: [] },
  ],
})
export class CareerPathModule {}
