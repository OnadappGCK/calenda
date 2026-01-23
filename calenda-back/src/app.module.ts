import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { Event } from './events/event.entity';
import { EventsModule } from './events/events.module';
import { News } from './news/news.entity';
import { NewsModule } from './news/news.module';
import { SeedModule } from './seed/seed.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'calenda.sqlite',
      entities: [User, Event, News],
      synchronize: true,
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    EventsModule,
    NewsModule,
    AdminModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
