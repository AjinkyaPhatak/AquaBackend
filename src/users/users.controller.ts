import { Controller, Get, UseGuards, Req, Put, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req) {
    const user = await this.usersService.findById(req.user.userId);
    const { password, ...result } = user.toObject();
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req, @Body() updateData: { name?: string; avatar?: string }) {
    const user = await this.usersService.updateProfile(req.user.userId, updateData);
    const { password, ...result } = user.toObject();
    return result;
  }
}
