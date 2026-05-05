import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Etablissement } from './etablissement.entity';
import { User } from '../users/user.entity';
import { EtablissementsService } from './etablissements.service';
import { EtablissementsController } from './etablissements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Etablissement, User])],
  controllers: [EtablissementsController],
  providers: [EtablissementsService],
  exports: [EtablissementsService],
})
export class EtablissementsModule {}
