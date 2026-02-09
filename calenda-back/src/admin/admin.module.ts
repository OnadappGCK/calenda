import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { AdminController } from './admin.controller';
import { MartiguesMergeService } from './martigues-merge.service';

@Module({
  imports: [EventsModule, TypeOrmModule.forFeature([Event, User])],
  controllers: [AdminController],
  providers: [MartiguesMergeService],
})
/** Module Admin (endpoints réservés au rôle ADMIN). */
export class AdminModule {}
