import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
/**
 * Guard Passport: tente de décoder un JWT si présent, mais n'échoue pas si absent/invalide.
 * Utile pour des routes publiques qui peuvent bénéficier d'un user optionnel.
 */
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /** Retourne `null` en cas d'erreur/absence, sinon l'utilisateur extrait du JWT. */
  handleRequest(err: any, user: any, _info: any, _context: ExecutionContext) {
    if (err) {
      return null;
    }
    return user ?? null;
  }
}
