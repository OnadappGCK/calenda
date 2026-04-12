import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Event } from './event.entity';
import { Highlight } from './highlight.entity';
import { EventsController } from './events.controller';
import { HighlightsController } from './highlights.controller';
import { EventsService } from './events.service';
import { HighlightsService } from './highlights.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User, Highlight])],
  controllers: [EventsController, HighlightsController],
  providers: [EventsService, HighlightsService],
  exports: [EventsService, HighlightsService],
})
/** Module Events (endpoints + logique métier autour des événements). */
export class EventsModule {}
