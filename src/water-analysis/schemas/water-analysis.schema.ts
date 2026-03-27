import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WaterAnalysisDocument = WaterAnalysis & Document;

@Schema({ timestamps: true })
export class WaterAnalysis {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  imagePath: string;

  @Prop({ required: true })
  overallSafetyScore: number;

  @Prop({ required: true, enum: ['safe', 'warning', 'unsafe'] })
  safetyStatus: string;

  @Prop({ type: Object, required: true })
  parameters: {
    foamCoverage: { value: number; status: string; description: string };
    algaeDensity: { value: number; status: string; description: string };
    shorelineResidue: { value: number; status: string; description: string };
    waterDiscoloration: { value: number; status: string; description: string };
    stagnationIndex: { value: number; status: string; description: string };
    surfaceVolatility: { value: number; status: string; description: string };
  };

  @Prop({ type: [String], default: [] })
  recommendations: string[];

  @Prop({ default: '' })
  detailedAnalysis: string;

  @Prop({ default: '' })
  waterType: string;

  @Prop({ type: [String], default: [] })
  potentialContaminants: string[];

  @Prop({ default: 'watch' })
  frothStage: string;

  @Prop({ default: 48 })
  estimatedTimeToFrothHours: number;

  @Prop({ default: '1-2 days' })
  estimatedTimeToFrothLabel: string;

  @Prop({ default: 65 })
  frothConfidence: number;

  @Prop({ default: 20 })
  estimatedFrothCoveragePercent: number;

  @Prop({ type: [String], default: [] })
  keyDrivers: string[];

  @Prop({ default: '' })
  location: string;

  @Prop({ default: '' })
  notes: string;
}

export const WaterAnalysisSchema = SchemaFactory.createForClass(WaterAnalysis);
