import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaterAnalysis, WaterAnalysisDocument } from './schemas/water-analysis.schema';
import { GeminiService, WaterAnalysisResult } from '../gemini/gemini.service';
import { UsersService } from '../users/users.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WaterAnalysisService {
  constructor(
    @InjectModel(WaterAnalysis.name) private analysisModel: Model<WaterAnalysisDocument>,
    private geminiService: GeminiService,
    private usersService: UsersService,
  ) {}

  async analyzeImage(
    userId: string,
    file: Express.Multer.File,
    createDto: CreateAnalysisDto,
  ): Promise<WaterAnalysisDocument> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    // Convert image to base64
    const imageBase64 = file.buffer.toString('base64');
    const mimeType = file.mimetype;

    // Analyze with Gemini
    const analysisResult = await this.geminiService.analyzeWaterImage(imageBase64, mimeType);

    // Save the image
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // Create analysis record
    const analysis = new this.analysisModel({
      userId: new Types.ObjectId(userId),
      imagePath: `/uploads/${fileName}`,
      overallSafetyScore: analysisResult.overallSafetyScore,
      safetyStatus: analysisResult.safetyStatus,
      parameters: analysisResult.parameters,
      recommendations: analysisResult.recommendations,
      detailedAnalysis: analysisResult.detailedAnalysis,
      waterType: analysisResult.waterType,
      potentialContaminants: analysisResult.potentialContaminants,
      location: createDto.location || '',
      notes: createDto.notes || '',
    });

    const saved = await analysis.save();

    // Increment user's analysis count
    await this.usersService.incrementAnalyses(userId);

    return saved;
  }

  async getUserAnalyses(userId: string, page = 1, limit = 10): Promise<{
    analyses: WaterAnalysisDocument[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    
    const [analyses, total] = await Promise.all([
      this.analysisModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.analysisModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);

    return {
      analyses,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    };
  }

  async getAnalysisById(userId: string, analysisId: string): Promise<WaterAnalysisDocument> {
    const analysis = await this.analysisModel.findOne({
      _id: new Types.ObjectId(analysisId),
      userId: new Types.ObjectId(userId),
    });

    if (!analysis) {
      throw new NotFoundException('Analysis not found');
    }

    return analysis;
  }

  async deleteAnalysis(userId: string, analysisId: string): Promise<void> {
    const analysis = await this.analysisModel.findOneAndDelete({
      _id: new Types.ObjectId(analysisId),
      userId: new Types.ObjectId(userId),
    });

    if (!analysis) {
      throw new NotFoundException('Analysis not found');
    }

    // Delete the image file
    const imagePath = path.join(process.cwd(), analysis.imagePath);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  async getStats(userId: string): Promise<{
    totalAnalyses: number;
    safeCount: number;
    warningCount: number;
    unsafeCount: number;
    averageSafetyScore: number;
    recentAnalyses: WaterAnalysisDocument[];
  }> {
    const userIdObj = new Types.ObjectId(userId);
    
    const [
      totalAnalyses,
      safeCount,
      warningCount,
      unsafeCount,
      avgResult,
      recentAnalyses,
    ] = await Promise.all([
      this.analysisModel.countDocuments({ userId: userIdObj }),
      this.analysisModel.countDocuments({ userId: userIdObj, safetyStatus: 'safe' }),
      this.analysisModel.countDocuments({ userId: userIdObj, safetyStatus: 'warning' }),
      this.analysisModel.countDocuments({ userId: userIdObj, safetyStatus: 'unsafe' }),
      this.analysisModel.aggregate([
        { $match: { userId: userIdObj } },
        { $group: { _id: null, avg: { $avg: '$overallSafetyScore' } } },
      ]),
      this.analysisModel
        .find({ userId: userIdObj })
        .sort({ createdAt: -1 })
        .limit(5)
        .exec(),
    ]);

    return {
      totalAnalyses,
      safeCount,
      warningCount,
      unsafeCount,
      averageSafetyScore: avgResult[0]?.avg || 0,
      recentAnalyses,
    };
  }
}
