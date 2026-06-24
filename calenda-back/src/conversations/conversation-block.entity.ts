import { CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ConversationGroup } from './conversation-group.entity';

@Entity('conversation_blocks')
@Index(['group', 'blocker', 'blocked'], { unique: true })
export class ConversationBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ConversationGroup, { nullable: false, eager: false, onDelete: 'CASCADE' })
  group!: ConversationGroup;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  blocker!: User;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  blocked!: User;

  @CreateDateColumn()
  createdAt!: Date;
}
