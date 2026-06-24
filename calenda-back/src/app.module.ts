import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { EmailVerificationCode } from './common/email-verification-code.entity';
import { Event } from './events/event.entity';
import { EventSlot } from './events/event-slot.entity';
import { Highlight } from './events/highlight.entity';
import { EventsModule } from './events/events.module';
import { ConversationGroup } from './conversations/conversation-group.entity';
import { ConversationMessage } from './conversations/conversation-message.entity';
import { ConversationParticipant } from './conversations/conversation-participant.entity';
import { ConversationBlock } from './conversations/conversation-block.entity';
import { ConversationMessageLike } from './conversations/conversation-message-like.entity';
import { ConversationsModule } from './conversations/conversations.module';
import { News } from './news/news.entity';
import { NewsModule } from './news/news.module';
import { Etablissement } from './etablissements/etablissement.entity';
import { EtablissementsModule } from './etablissements/etablissements.module';
import { SeedModule } from './seed/seed.module';
import { User } from './users/user.entity';
import { UserProfileReport } from './users/user-profile-report.entity';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UserNotification } from './notifications/user-notification.entity';

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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = (config.get<string>('DB_TYPE') ?? '').toLowerCase();
        const usePostgres = dbType === 'postgres' || !!config.get<string>('DB_HOST');
        const synchronize = (config.get<string>('DB_SYNCHRONIZE') ?? 'true').toLowerCase() === 'true';

        if (usePostgres) {
          return {
            type: 'postgres' as const,
            host: config.get<string>('DB_HOST') ?? 'localhost',
            port: Number(config.get<string>('DB_PORT') ?? 5432),
            username: config.get<string>('DB_USER') ?? 'postgres',
            password: config.get<string>('DB_PASS') ?? '',
            database: config.get<string>('DB_NAME') ?? 'calenda',
            schema: config.get<string>('DB_SCHEMA') ?? 'public',
            entities: [
              User,
              Event,
              EventSlot,
              News,
              Highlight,
              Etablissement,
              ConversationGroup,
              ConversationMessage,
              ConversationParticipant,
              ConversationBlock,
              ConversationMessageLike,
              UserProfileReport,
              EmailVerificationCode,
              UserNotification,
            ],
            synchronize,
            uuidExtension: 'pgcrypto' as const,
            installExtensions: true,
          };
        }

        return {
          type: 'sqlite' as const,
          database: config.get<string>('SQLITE_PATH') ?? 'calenda.sqlite',
          entities: [
            User,
            Event,
            EventSlot,
            News,
            Highlight,
            Etablissement,
            ConversationGroup,
            ConversationMessage,
            ConversationParticipant,
            ConversationBlock,
            ConversationMessageLike,
            UserProfileReport,
            EmailVerificationCode,
            UserNotification,
          ],
          synchronize,
        };
      },
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    EventsModule,
    NewsModule,
    ConversationsModule,
    NotificationsModule,
    AdminModule,
    EtablissementsModule,
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
/**
 * Module racine NestJS.
 * Déclare la config globale, la base SQLite (TypeORM), le throttling, et les sous-modules (auth/users/events/news/admin/seed).
 */
export class AppModule {}
