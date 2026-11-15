import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { InterviewCopilotController } from './interview-copilot.controller';
import { InterviewCopilotService } from './interview-copilot.service';

@Module({ imports: [CareerProfileModule], controllers: [InterviewCopilotController], providers: [InterviewCopilotService] })
export class InterviewCopilotModule {}
