import { CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ConversationMessage } from './conversation-message.entity';

@Entity('conversation_message_likes')
@Index(['message', 'user'], { unique: true })
export class ConversationMessageLike {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ConversationMessage, { nullable: false, eager: false, onDelete: 'CASCADE' })
  message!: ConversationMessage;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;
}
