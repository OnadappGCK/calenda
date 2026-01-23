import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../common/enums/role.enum';

/** Payload contenu dans le JWT (signe en login). */
export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

@Injectable()
/** Strategy Passport: valide les JWT Bearer et expose l'utilisateur au `Request.user`. */
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev_secret',
    });
  }

  /** Mappe le payload JWT vers un user minimal attaché à la requête. */
  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
