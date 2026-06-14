import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateConversationGroupDto } from './dto/create-conversation-group.dto';
import { CreateConversationMessageDto } from './dto/create-conversation-message.dto';
import { ListConversationGroupsQueryDto } from './dto/list-conversation-groups.query';
import { ConversationsService } from './conversations.service';

@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('events/:eventId/conversation-groups')
  async listGroups(@Param('eventId') eventId: string, @Query() query: ListConversationGroupsQueryDto, @Req() req: any) {
    return this.conversationsService.listGroups(eventId, query, req.user?.id ?? null);
  }

  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('events/:eventId/conversation-groups')
  async createGroup(@Param('eventId') eventId: string, @Body() dto: CreateConversationGroupDto, @Req() req: any) {
    return this.conversationsService.createGroup(eventId, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversation-groups/:groupId/join')
  async joinGroup(@Param('groupId') groupId: string, @Req() req: any) {
    return this.conversationsService.joinGroup(groupId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversation-groups/:groupId/leave')
  async leaveGroup(@Param('groupId') groupId: string, @Req() req: any) {
    return this.conversationsService.leaveGroup(groupId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('conversation-groups/:groupId')
  async deleteGroup(@Param('groupId') groupId: string, @Req() req: any) {
    return this.conversationsService.deleteGroup(groupId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversation-groups/:groupId/messages')
  async listMessages(@Param('groupId') groupId: string, @Req() req: any) {
    return this.conversationsService.listMessages(groupId, req.user.id);
  }

  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('conversation-groups/:groupId/messages')
  async postMessage(@Param('groupId') groupId: string, @Body() dto: CreateConversationMessageDto, @Req() req: any) {
    return this.conversationsService.postMessage(groupId, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversation-messages/:messageId/report')
  async reportMessage(@Param('messageId') messageId: string, @Req() req: any) {
    return this.conversationsService.reportMessage(messageId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversation-messages/:messageId/like')
  async toggleLike(@Param('messageId') messageId: string, @Req() req: any) {
    return this.conversationsService.toggleLike(messageId, req.user.id);
  }

}
