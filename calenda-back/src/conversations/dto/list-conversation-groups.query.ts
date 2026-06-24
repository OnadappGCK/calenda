import { IsOptional, IsString } from 'class-validator';

export class ListConversationGroupsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
