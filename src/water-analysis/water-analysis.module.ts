import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { WaterAnalysisService } from './water-analysis.service';
import { WaterAnalysisController } from './water-analysis.controller';
import { WaterAnalysis, WaterAnalysisSchema } from './schemas/water-analysis.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WaterAnalysis.name, schema: WaterAnalysisSchema }]),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    UsersModule,
  ],
  controllers: [WaterAnalysisController],
  providers: [WaterAnalysisService],
  exports: [WaterAnalysisService],
})
export class WaterAnalysisModule {}
