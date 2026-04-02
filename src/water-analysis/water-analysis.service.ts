import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaterAnalysis, WaterAnalysisDocument } from './schemas/water-analysis.schema';
import { UsersService } from '../users/users.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import * as fs from 'fs';
import * as path from 'path';

type RiskPredictionLabel = 'Low Risk' | 'Medium Risk' | 'High Risk';

type WaterAnalysisResult = {
  overallSafetyScore: number;
  safetyStatus: 'safe' | 'warning' | 'unsafe';
  parameters: {
    foamCoverage: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
    algaeDensity: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
    shorelineResidue: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
    waterDiscoloration: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
    stagnationIndex: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
    surfaceVolatility: { value: number; status: 'safe' | 'warning' | 'unsafe'; description: string };
  };
  recommendations: string[];
  detailedAnalysis: string;
  waterType: string;
  potentialContaminants: string[];
  frothStage: 'stable' | 'watch' | 'forming' | 'imminent';
  estimatedTimeToFrothHours: number;
  estimatedTimeToFrothLabel: string;
  frothConfidence: number;
  estimatedFrothCoveragePercent: number;
  keyDrivers: string[];
};

@Injectable()
export class WaterAnalysisService {
  constructor(
    @InjectModel(WaterAnalysis.name) private analysisModel: Model<WaterAnalysisDocument>,
    private configService: ConfigService,
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

    const prediction = await this.predictRisk(file);
    const analysisResult = this.buildAnalysisResult(prediction, createDto);

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
      frothStage: analysisResult.frothStage,
      estimatedTimeToFrothHours: analysisResult.estimatedTimeToFrothHours,
      estimatedTimeToFrothLabel: analysisResult.estimatedTimeToFrothLabel,
      frothConfidence: analysisResult.frothConfidence,
      estimatedFrothCoveragePercent: analysisResult.estimatedFrothCoveragePercent,
      keyDrivers: analysisResult.keyDrivers,
      location: createDto.location || '',
      notes: createDto.notes || '',
    });

    const saved = await analysis.save();

    // Increment user's analysis count
    await this.usersService.incrementAnalyses(userId);

    return saved;
  }

  private async predictRisk(file: Express.Multer.File): Promise<RiskPredictionLabel> {
    const mlServiceUrl =
      this.configService.get<string>('ML_SERVICE_URL') || 'http://localhost:8000/predict';

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    let response: Response;
    try {
      response = await fetch(mlServiceUrl, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      throw new BadRequestException('Local ML service is unavailable');
    }

    if (!response.ok) {
      throw new BadRequestException('Local ML prediction failed');
    }

    const payload = (await response.json()) as { prediction?: RiskPredictionLabel };
    if (!payload.prediction) {
      throw new BadRequestException('Local ML service returned an invalid prediction');
    }

    return payload.prediction;
  }

  private buildAnalysisResult(
    prediction: RiskPredictionLabel,
    createDto: CreateAnalysisDto,
  ): WaterAnalysisResult {
    const notes = createDto.notes?.trim();
    const location = createDto.location?.trim();

    const profiles: Record<RiskPredictionLabel, WaterAnalysisResult> = {
      'Low Risk': {
        overallSafetyScore: 88,
        safetyStatus: 'safe',
        parameters: {
          foamCoverage: {
            value: 12,
            status: 'safe',
            description: 'Surface foam coverage appears limited across the visible water body.',
          },
          algaeDensity: {
            value: 24,
            status: 'safe',
            description: 'Vegetation and bloom-like texture remain low in the captured scene.',
          },
          shorelineResidue: {
            value: 18,
            status: 'safe',
            description: 'Only minor shoreline residue signatures are visible near the edges.',
          },
          waterDiscoloration: {
            value: 21,
            status: 'safe',
            description: 'Water color variation remains within a lower-risk range.',
          },
          stagnationIndex: {
            value: 26,
            status: 'safe',
            description: 'The scene suggests healthy dispersion rather than stagnant concentration.',
          },
          surfaceVolatility: {
            value: 22,
            status: 'safe',
            description: 'Surface disturbance patterns do not indicate rapid froth formation.',
          },
        },
        recommendations: [
          'Continue routine monitoring with the current capture cadence.',
          'Keep shoreline checks in place after rainfall or discharge events.',
        ],
        detailedAnalysis:
          'The local satellite classifier marked this image as low risk. Land-cover patterns around the observed water area align with lower immediate frothing pressure.',
        waterType: 'Low-risk satellite water zone',
        potentialContaminants: ['Minor suspended solids'],
        frothStage: 'stable',
        estimatedTimeToFrothHours: 72,
        estimatedTimeToFrothLabel: '3+ days',
        frothConfidence: 84,
        estimatedFrothCoveragePercent: 8,
        keyDrivers: ['Low-risk land-cover class', 'Limited visible residue', 'Lower stagnation signature'],
      },
      'Medium Risk': {
        overallSafetyScore: 61,
        safetyStatus: 'warning',
        parameters: {
          foamCoverage: {
            value: 42,
            status: 'warning',
            description: 'Moderate surface patterning may support localized froth buildup.',
          },
          algaeDensity: {
            value: 51,
            status: 'warning',
            description: 'Vegetation density suggests conditions worth closer observation.',
          },
          shorelineResidue: {
            value: 47,
            status: 'warning',
            description: 'Residue signatures indicate some accumulation along the margins.',
          },
          waterDiscoloration: {
            value: 49,
            status: 'warning',
            description: 'Color variation suggests moderate water quality stress in the image.',
          },
          stagnationIndex: {
            value: 58,
            status: 'warning',
            description: 'Surface layout indicates moderate retention and slower movement.',
          },
          surfaceVolatility: {
            value: 46,
            status: 'warning',
            description: 'The water surface may support gradual froth development.',
          },
        },
        recommendations: [
          'Increase monitoring frequency for the next 24 to 48 hours.',
          'Inspect nearby inflow and shoreline activity for nutrient or residue sources.',
        ],
        detailedAnalysis:
          'The local satellite classifier marked this image as medium risk. Surrounding land-cover features suggest moderate environmental pressure and a watch-state for froth formation.',
        waterType: 'Moderate-risk satellite water zone',
        potentialContaminants: ['Nutrient runoff', 'Organic residue'],
        frothStage: 'watch',
        estimatedTimeToFrothHours: 36,
        estimatedTimeToFrothLabel: '1-2 days',
        frothConfidence: 72,
        estimatedFrothCoveragePercent: 24,
        keyDrivers: ['Moderate-risk land-cover class', 'Noticeable shoreline residue', 'Elevated stagnation signature'],
      },
      'High Risk': {
        overallSafetyScore: 28,
        safetyStatus: 'unsafe',
        parameters: {
          foamCoverage: {
            value: 74,
            status: 'unsafe',
            description: 'Surface texture indicates a strong likelihood of concentrated froth zones.',
          },
          algaeDensity: {
            value: 69,
            status: 'unsafe',
            description: 'Bloom-like patterns are elevated and consistent with stressed water conditions.',
          },
          shorelineResidue: {
            value: 77,
            status: 'unsafe',
            description: 'Shoreline residue concentration appears substantial in the surrounding area.',
          },
          waterDiscoloration: {
            value: 72,
            status: 'unsafe',
            description: 'Marked discoloration indicates heightened contamination risk.',
          },
          stagnationIndex: {
            value: 81,
            status: 'unsafe',
            description: 'The scene suggests retention-heavy flow conditions that support froth persistence.',
          },
          surfaceVolatility: {
            value: 76,
            status: 'unsafe',
            description: 'Surface conditions indicate high near-term froth formation risk.',
          },
        },
        recommendations: [
          'Trigger immediate on-site inspection and sampling.',
          'Review nearby industrial, residential, and transport runoff sources.',
          'Prepare short-interval follow-up satellite captures to confirm progression.',
        ],
        detailedAnalysis:
          'The local satellite classifier marked this image as high risk. Nearby land-use patterns align with stronger anthropogenic pressure and an elevated chance of rapid froth development.',
        waterType: 'High-risk satellite water zone',
        potentialContaminants: ['Industrial runoff', 'Urban discharge', 'Roadside pollutant load'],
        frothStage: 'imminent',
        estimatedTimeToFrothHours: 12,
        estimatedTimeToFrothLabel: 'Within 12 hours',
        frothConfidence: 86,
        estimatedFrothCoveragePercent: 57,
        keyDrivers: ['High-risk land-cover class', 'Severe stagnation signature', 'Strong contamination indicators'],
      },
    };

    const baseProfile = profiles[prediction];
    const locationSuffix = location ? ` Location context: ${location}.` : '';
    const notesSuffix = notes ? ` Analyst notes: ${notes}.` : '';

    return {
      ...baseProfile,
      detailedAnalysis: `${baseProfile.detailedAnalysis}${locationSuffix}${notesSuffix}`,
    };
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

    const normalizedImagePath = analysis.imagePath.replace(/^[\\/]+/, '');
    const imagePath = path.join(process.cwd(), normalizedImagePath);
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
