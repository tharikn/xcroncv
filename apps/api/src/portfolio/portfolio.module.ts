import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { PortfolioController, PublicPortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [CareerProfileModule],
  controllers: [PortfolioController, PublicPortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
