import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { EventsModule } from '../events/events.module';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { AdminController } from './admin.controller';
import { MartiguesMergeService } from './martigues-merge.service';
import { SalsaOlivierMergeService } from './salsa-olivier-merge.service';

@Module({
  imports: [CommonModule, EventsModule, TypeOrmModule.forFeature([Event, User])],
  controllers: [AdminController],
  providers: [MartiguesMergeService, SalsaOlivierMergeService],
})
/** Module Admin (endpoints réservés au rôle ADMIN). */
export class AdminModule {}
