import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { ConversationBlock } from './conversation-block.entity';
import { ConversationGroup } from './conversation-group.entity';
import { ConversationMessageLike } from './conversation-message-like.entity';
import { ConversationMessage } from './conversation-message.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      User,
      ConversationGroup,
      ConversationMessage,
      ConversationParticipant,
      ConversationBlock,
      ConversationMessageLike,
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
