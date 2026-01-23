import { Injectable } from '@nestjs/common';

@Injectable()
/** Service technique associé au healthcheck. */
export class AppService {
  /** Retourne un payload stable utilisé par `GET /api/health`. */
  getHealth() {
    return { status: 'ok' };
  }
}
