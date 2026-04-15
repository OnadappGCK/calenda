import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { EtablissementType } from '../common/enums/etablissement-type.enum';
import { EtablissementsService } from './etablissements.service';
import { CreateEtablissementDto, UpdateEtablissementDto } from './dto/create-etablissement.dto';

@Controller('etablissements')
export class EtablissementsController {
  constructor(private readonly svc: EtablissementsService) {}

  @Get()
  list(@Query('type') type?: string, @Query('tag') tag?: string) {
    return this.svc.list(type as EtablissementType | undefined, tag);
  }

  @Get('tags/top')
  topTags(@Query('type') type?: string, @Query('limit') limit?: string) {
    return this.svc.topTags(
      type as EtablissementType | undefined,
      limit ? Number(limit) : 5,
    );
  }

  @Get('tags/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  allTags() {
    return this.svc.allTags();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreateEtablissementDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateEtablissementDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
