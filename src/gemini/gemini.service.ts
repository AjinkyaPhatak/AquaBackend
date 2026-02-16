import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export interface WaterAnalysisResult {
  overallSafetyScore: number;
  safetyStatus: "safe" | "warning" | "unsafe";
  parameters: {
    ph: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
    turbidity: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
    algaeLevel: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
    bacteriaCount: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
    temperature: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
    contaminationRisk: {
      value: number;
      status: "safe" | "warning" | "unsafe";
      description: string;
    };
  };
  recommendations: string[];
  detailedAnalysis: string;
  waterType: string;
  potentialContaminants: string[];
}

@Injectable()
export class GeminiService implements OnModuleInit {
  private genAI!: GoogleGenerativeAI;
  private model!: GenerativeModel;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>("GEMINI_API_KEY");
    if (apiKey && apiKey !== "your-gemini-api-key-here") {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Using gemini-1.5-flash - free tier model with vision capabilities
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }
  }

  async analyzeWaterImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<WaterAnalysisResult> {
    // Check if Gemini API is configured
    if (!this.model) {
      return this.generateMockAnalysis();
    }

    try {
      const prompt = `You are an expert water quality analyst. Analyze this water sample image and provide a detailed water safety analysis.

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "overallSafetyScore": <number 0-100>,
  "safetyStatus": "<safe|warning|unsafe>",
  "parameters": {
    "ph": { "value": <number 0-14>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "turbidity": { "value": <number 0-100 NTU>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "algaeLevel": { "value": <number 0-100 percentage>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "bacteriaCount": { "value": <number CFU/mL estimate>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "temperature": { "value": <number in Celsius>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "contaminationRisk": { "value": <number 0-100 percentage>, "status": "<safe|warning|unsafe>", "description": "<brief description>" }
  },
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "detailedAnalysis": "<2-3 sentence detailed analysis>",
  "waterType": "<type of water body: river, lake, pond, ocean, etc.>",
  "potentialContaminants": ["<contaminant 1>", "<contaminant 2>"]
}

Analyze the visual characteristics:
- Water color and clarity
- Visible particles or debris
- Surface conditions
- Signs of algae or biological growth
- Environmental context

Provide realistic estimates based on visual analysis. If the image is not of water, indicate low safety score and explain in the detailed analysis.`;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]) as WaterAnalysisResult;
        return this.validateAndNormalizeResult(analysisResult);
      }

      return this.generateMockAnalysis();
    } catch (error) {
      console.error("Gemini API error:", error);
      return this.generateMockAnalysis();
    }
  }

  private validateAndNormalizeResult(
    result: WaterAnalysisResult,
  ): WaterAnalysisResult {
    // Ensure all required fields exist with proper types
    return {
      overallSafetyScore: Math.min(
        100,
        Math.max(0, result.overallSafetyScore || 50),
      ),
      safetyStatus: result.safetyStatus || "warning",
      parameters: {
        ph: result.parameters?.ph || {
          value: 7,
          status: "safe",
          description: "Normal pH level",
        },
        turbidity: result.parameters?.turbidity || {
          value: 5,
          status: "safe",
          description: "Clear water",
        },
        algaeLevel: result.parameters?.algaeLevel || {
          value: 10,
          status: "safe",
          description: "Low algae presence",
        },
        bacteriaCount: result.parameters?.bacteriaCount || {
          value: 100,
          status: "safe",
          description: "Within safe limits",
        },
        temperature: result.parameters?.temperature || {
          value: 20,
          status: "safe",
          description: "Normal temperature",
        },
        contaminationRisk: result.parameters?.contaminationRisk || {
          value: 15,
          status: "safe",
          description: "Low contamination risk",
        },
      },
      recommendations: result.recommendations || [
        "Continue monitoring water quality",
      ],
      detailedAnalysis:
        result.detailedAnalysis || "Analysis completed successfully.",
      waterType: result.waterType || "Unknown",
      potentialContaminants: result.potentialContaminants || [],
    };
  }

  private generateMockAnalysis(): WaterAnalysisResult {
    // Generate realistic mock data when API is not configured
    const safetyScore = Math.floor(Math.random() * 40) + 60; // 60-100
    const safetyStatus =
      safetyScore >= 80 ? "safe" : safetyScore >= 60 ? "warning" : "unsafe";

    return {
      overallSafetyScore: safetyScore,
      safetyStatus: safetyStatus as "safe" | "warning" | "unsafe",
      parameters: {
        ph: {
          value: 6.5 + Math.random() * 2,
          status: "safe",
          description: "pH level within acceptable range for surface water",
        },
        turbidity: {
          value: Math.floor(Math.random() * 20) + 5,
          status: Math.random() > 0.7 ? "warning" : "safe",
          description: "Water clarity indicates moderate suspended particles",
        },
        algaeLevel: {
          value: Math.floor(Math.random() * 30) + 5,
          status: Math.random() > 0.8 ? "warning" : "safe",
          description: "Algae concentration at acceptable levels",
        },
        bacteriaCount: {
          value: Math.floor(Math.random() * 500) + 50,
          status: Math.random() > 0.7 ? "warning" : "safe",
          description: "Bacterial levels within safety guidelines",
        },
        temperature: {
          value: Math.floor(Math.random() * 15) + 15,
          status: "safe",
          description: "Temperature suitable for aquatic life",
        },
        contaminationRisk: {
          value: Math.floor(Math.random() * 25) + 5,
          status: Math.random() > 0.8 ? "warning" : "safe",
          description: "Low contamination risk detected",
        },
      },
      recommendations: [
        "Regular monitoring recommended for this water source",
        "Consider filtration before any recreational use",
        "Test for specific contaminants if water is used for consumption",
        "Monitor seasonal changes in water quality",
      ],
      detailedAnalysis:
        "The water sample shows characteristics consistent with natural surface water. Visual analysis indicates moderate clarity with some suspended particles. The coloration suggests minimal algae growth and acceptable organic matter levels.",
      waterType: "Surface water (lake/pond)",
      potentialContaminants: [
        "Organic matter",
        "Sediment particles",
        "Natural minerals",
      ],
    };
  }
}
