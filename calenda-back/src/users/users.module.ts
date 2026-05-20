import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/event.entity';
import { User } from './user.entity';
import { UserProfileReport } from './user-profile-report.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Event, UserProfileReport])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
/** Module Users (profil courant + favoris). */
export class UsersModule {}
