import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ContactController } from './contact.controller';

@Module({
  imports: [CommonModule],
  controllers: [ContactController],
})
export class ContactModule {}
