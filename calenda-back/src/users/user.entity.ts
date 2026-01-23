import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { Event } from '../events/event.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true })
  pseudo!: string;

  @Column()
  ville!: string;

  @Column()
  lieu!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'text', default: Role.UTILISATEUR })
  role!: Role;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ type: 'text', nullable: true })
  emailVerificationToken!: string | null;

  @OneToMany(() => Event, (event) => event.organisateur)
  organizedEvents!: Event[];

  @ManyToMany(() => Event, (event) => event.favoritedBy)
  @JoinTable({ name: 'user_favorites' })
  favorites!: Event[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
