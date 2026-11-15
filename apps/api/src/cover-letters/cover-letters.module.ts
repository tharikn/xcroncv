import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { ApplicationCoverLetterController, CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

@Module({
  imports: [CareerProfileModule],
  controllers: [CoverLettersController, ApplicationCoverLetterController],
  providers: [CoverLettersService],
})
export class CoverLettersModule {}
