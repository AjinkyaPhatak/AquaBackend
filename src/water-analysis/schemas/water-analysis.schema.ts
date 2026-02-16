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
    ph: { value: number; status: string; description: string };
    turbidity: { value: number; status: string; description: string };
    algaeLevel: { value: number; status: string; description: string };
    bacteriaCount: { value: number; status: string; description: string };
    temperature: { value: number; status: string; description: string };
    contaminationRisk: { value: number; status: string; description: string };
  };

  @Prop({ type: [String], default: [] })
  recommendations: string[];

  @Prop({ default: '' })
  detailedAnalysis: string;

  @Prop({ default: '' })
  waterType: string;

  @Prop({ type: [String], default: [] })
  potentialContaminants: string[];

  @Prop({ default: '' })
  location: string;

  @Prop({ default: '' })
  notes: string;
}

export const WaterAnalysisSchema = SchemaFactory.createForClass(WaterAnalysis);
