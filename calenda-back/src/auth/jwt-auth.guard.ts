import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
/** Guard Passport: exige un JWT valide (strategy `jwt`). */
export class JwtAuthGuard extends AuthGuard('jwt') {}
