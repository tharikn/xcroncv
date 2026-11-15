import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { AutofillController } from './autofill.controller';
import { AutofillService } from './autofill.service';

@Module({
  imports: [CareerProfileModule],
  controllers: [AutofillController],
  providers: [AutofillService],
})
export class AutofillModule {}
