import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WaterAnalysisService } from './water-analysis.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('water-analysis')
@UseGuards(JwtAuthGuard)
export class WaterAnalysisController {
  constructor(private readonly waterAnalysisService: WaterAnalysisService) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
        cb(new Error('Only image files are allowed'), false);
      }
      cb(null, true);
    },
  }))
  async analyzeImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() createDto: CreateAnalysisDto,
    @Req() req,
  ) {
    return this.waterAnalysisService.analyzeImage(req.user.userId, file, createDto);
  }

  @Get('history')
  async getHistory(
    @Req() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.waterAnalysisService.getUserAnalyses(req.user.userId, page, limit);
  }

  @Get('stats')
  async getStats(@Req() req) {
    return this.waterAnalysisService.getStats(req.user.userId);
  }

  @Get(':id')
  async getAnalysis(@Param('id') id: string, @Req() req) {
    return this.waterAnalysisService.getAnalysisById(req.user.userId, id);
  }

  @Delete(':id')
  async deleteAnalysis(@Param('id') id: string, @Req() req) {
    await this.waterAnalysisService.deleteAnalysis(req.user.userId, id);
    return { message: 'Analysis deleted successfully' };
  }
}
