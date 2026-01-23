import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('health')
/** Controller technique: endpoint de healthcheck. */
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  /** Retourne un statut simple pour vérifier que l'API répond. */
  getHealth() {
    return this.appService.getHealth();
  }
}
