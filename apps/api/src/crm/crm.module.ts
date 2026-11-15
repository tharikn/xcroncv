import { Module } from '@nestjs/common';
import { ContactsController, FollowUpTasksController, JobActivitiesController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  controllers: [ContactsController, JobActivitiesController, FollowUpTasksController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
