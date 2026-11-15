import { Module } from '@nestjs/common';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { CareerDocumentsController } from './career-documents.controller';
import { CareerDocumentsService } from './career-documents.service';

@Module({ imports: [CareerProfileModule], controllers: [CareerDocumentsController], providers: [CareerDocumentsService] })
export class CareerDocumentsModule {}
