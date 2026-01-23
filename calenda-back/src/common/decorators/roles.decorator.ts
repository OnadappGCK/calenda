import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/** Clé metadata utilisée par `RolesGuard` pour récupérer les rôles requis. */
export const ROLES_KEY = 'roles';

/** Décorateur: associe une liste de rôles requis à un handler ou une classe. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
