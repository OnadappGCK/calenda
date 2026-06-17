import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Event } from './event.entity';

@Entity('event_slots')
/** Créneau horaire d'un événement (date + heure début + heure fin). */
export class EventSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  /** Date du créneau, format ISO local « YYYY-MM-DD ». */
  @Column({ type: 'varchar', length: 10 })
  date!: string;

  /** Heure de début, format « HH:MM ». */
  @Column({ type: 'varchar', length: 5 })
  heureDebut!: string;

  /** Heure de fin, format « HH:MM ». */
  @Column({ type: 'varchar', length: 5 })
  heureFin!: string;

  /** Ordre d'affichage (pour trier les créneaux dans le formulaire). */
  @Column({ default: 0 })
  ordre!: number;
}
