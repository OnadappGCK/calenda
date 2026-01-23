import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

@Injectable()
/** Guard: vérifie que `req.user.role` est inclus dans les rôles requis (metadata `Roles`). */
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /** Applique la règle d'accès basée sur les rôles déclarés via le décorateur `@Roles(...)`. */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role } | undefined;

    if (!user?.role) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
