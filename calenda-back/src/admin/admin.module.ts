import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { EventsModule } from '../events/events.module';
import { Event } from '../events/event.entity';
import { EventSlot } from '../events/event-slot.entity';
import { User } from '../users/user.entity';
import { AdminController } from './admin.controller';
import { MartiguesMergeService } from './martigues-merge.service';
import { SalsaOlivierMergeService } from './salsa-olivier-merge.service';
import { CarryLeRouetMergeService } from './carry-le-rouet-merge.service';

@Module({
  imports: [CommonModule, EventsModule, TypeOrmModule.forFeature([Event, EventSlot, User])],
  controllers: [AdminController],
  providers: [MartiguesMergeService, SalsaOlivierMergeService, CarryLeRouetMergeService],
})
/** Module Admin (endpoints réservés au rôle ADMIN). */
export class AdminModule {}
