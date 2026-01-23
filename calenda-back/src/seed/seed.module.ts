import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/event.entity';
import { News } from '../news/news.entity';
import { User } from '../users/user.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Event, News])],
  providers: [SeedService],
})
/**
 * Module Seed.
 * Exécute des seeds de dev au démarrage (selon variables d'environnement).
 */
export class SeedModule implements OnModuleInit {
  constructor(private readonly seedService: SeedService) {}

  /** Hook NestJS: exécute les seeds (users/events/news) à l'initialisation du module. */
  async onModuleInit() {
    await this.seedService.seedDevUsers();
    await this.seedService.seedDevEvents();
    await this.seedService.seedDevNews();
  }
}
