import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [EventsModule],
  controllers: [AdminController],
})
/** Module Admin (endpoints réservés au rôle ADMIN). */
export class AdminModule {}
