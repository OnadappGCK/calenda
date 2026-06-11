import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { Event } from '../events/event.entity';
import { User } from './user.entity';
import { UserProfileReport } from './user-profile-report.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([User, Event, UserProfileReport])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
/** Module Users (profil courant + favoris). */
export class UsersModule {}
