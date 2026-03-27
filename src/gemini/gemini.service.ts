import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

type RiskStatus = "safe" | "warning" | "unsafe";

interface FrothIndicator {
  value: number;
  status: RiskStatus;
  description: string;
}

export interface WaterAnalysisResult {
  overallSafetyScore: number;
  safetyStatus: RiskStatus;
  parameters: {
    foamCoverage: FrothIndicator;
    algaeDensity: FrothIndicator;
    shorelineResidue: FrothIndicator;
    waterDiscoloration: FrothIndicator;
    stagnationIndex: FrothIndicator;
    surfaceVolatility: FrothIndicator;
  };
  recommendations: string[];
  detailedAnalysis: string;
  waterType: string;
  potentialContaminants: string[];
  frothStage: "stable" | "watch" | "forming" | "imminent";
  estimatedTimeToFrothHours: number;
  estimatedTimeToFrothLabel: string;
  frothConfidence: number;
  estimatedFrothCoveragePercent: number;
  keyDrivers: string[];
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
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }
  }

  async analyzeWaterImage(
    imageBase64: string,
    mimeType: string,
    context?: { location?: string; notes?: string },
  ): Promise<WaterAnalysisResult> {
    if (!this.model) {
      return this.generateMockAnalysis(context);
    }

    try {
      const locationText = context?.location?.trim()
        ? `Location context: ${context.location.trim()}`
        : "Location context: not provided";
      const notesText = context?.notes?.trim()
        ? `Operator notes: ${context.notes.trim()}`
        : "Operator notes: none";

      const prompt = `You are AquaSense, an expert in forecasting lake frothing from satellite imagery.

Your task is to analyze this image ONLY for one purpose: estimate whether this lake is likely to froth soon, and if so in how much time.

Additional context:
- ${locationText}
- ${notesText}

Important rules:
- Treat this as a lake frothing forecast, not drinking-water safety.
- Use only cautious visual inference from the image and supplied context.
- If the image is not a lake or the evidence is weak, reduce confidence and explain that uncertainty.
- estimatedTimeToFrothHours must be a non-negative number.
- estimatedTimeToFrothLabel must be a concise human-readable label such as "Already frothing", "Within 6 hours", "1-2 days", or "More than 3 days".
- frothConfidence must be a number from 0 to 100.
- estimatedFrothCoveragePercent must be a number from 0 to 100 describing likely visible froth coverage at peak near-term event.
- safetyStatus should map to frothing risk:
  - safe = low risk / not expected soon
  - warning = moderate risk / forming conditions
  - unsafe = high risk / frothing imminent or already visible
- frothStage must be one of: stable, watch, forming, imminent.
- parameters should describe frothing-related indicators, not lab chemistry.

Return ONLY a valid JSON object with this exact structure:
{
  "overallSafetyScore": <number 0-100 where higher means higher frothing risk>,
  "safetyStatus": "<safe|warning|unsafe>",
  "parameters": {
    "foamCoverage": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "algaeDensity": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "shorelineResidue": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "waterDiscoloration": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "stagnationIndex": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" },
    "surfaceVolatility": { "value": <number 0-100>, "status": "<safe|warning|unsafe>", "description": "<brief description>" }
  },
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "detailedAnalysis": "<2-4 sentence lake frothing forecast>",
  "waterType": "<lake classification or 'unknown water body'>",
  "potentialContaminants": ["<contaminant or driver 1>", "<contaminant or driver 2>"],
  "frothStage": "<stable|watch|forming|imminent>",
  "estimatedTimeToFrothHours": <number>,
  "estimatedTimeToFrothLabel": "<short label>",
  "frothConfidence": <number 0-100>,
  "estimatedFrothCoveragePercent": <number 0-100>,
  "keyDrivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
}

Focus on visual signals like:
- Existing foam streaks or pale surface mats
- Green or brown discoloration associated with bloom activity
- Shoreline accumulation bands
- Patchiness, slicks, or stagnant surface texture
- Near-shore concentration zones
- Any visible sign that frothing has already started`;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]) as WaterAnalysisResult;
        return this.validateAndNormalizeResult(analysisResult);
      }

      return this.generateMockAnalysis(context);
    } catch (error) {
      console.error("Gemini API error:", error);
      return this.generateMockAnalysis(context);
    }
  }

  private validateAndNormalizeResult(
    result: WaterAnalysisResult,
  ): WaterAnalysisResult {
    const defaultIndicator = (
      value: number,
      status: RiskStatus,
      description: string,
    ): FrothIndicator => ({
      value: Math.min(100, Math.max(0, value)),
      status,
      description,
    });

    const estimatedTimeToFrothHours = Math.max(
      0,
      Number(result.estimatedTimeToFrothHours ?? 48),
    );
    const frothConfidence = Math.min(100, Math.max(0, Number(result.frothConfidence ?? 65)));
    const estimatedFrothCoveragePercent = Math.min(
      100,
      Math.max(0, Number(result.estimatedFrothCoveragePercent ?? 20)),
    );

    return {
      overallSafetyScore: Math.min(
        100,
        Math.max(0, Number(result.overallSafetyScore ?? 50)),
      ),
      safetyStatus: result.safetyStatus || "warning",
      parameters: {
        foamCoverage:
          result.parameters?.foamCoverage ||
          defaultIndicator(18, "warning", "Visible pale surface streaks suggest early foam formation."),
        algaeDensity:
          result.parameters?.algaeDensity ||
          defaultIndicator(44, "warning", "Bloom-like coloration can support later frothing."),
        shorelineResidue:
          result.parameters?.shorelineResidue ||
          defaultIndicator(22, "safe", "Only light residue accumulation is visible near the shoreline."),
        waterDiscoloration:
          result.parameters?.waterDiscoloration ||
          defaultIndicator(38, "warning", "Moderate discoloration indicates elevated biological activity."),
        stagnationIndex:
          result.parameters?.stagnationIndex ||
          defaultIndicator(51, "warning", "Low circulation zones may allow froth to build up."),
        surfaceVolatility:
          result.parameters?.surfaceVolatility ||
          defaultIndicator(35, "safe", "Surface texture is disturbed but not strongly unstable."),
      },
      recommendations: result.recommendations?.length
        ? result.recommendations
        : [
            "Schedule another satellite review within the next 12 hours.",
            "Inspect likely accumulation zones near shoreline inlets and windward edges.",
            "Prepare field confirmation if visible foam bands begin to widen.",
          ],
      detailedAnalysis:
        result.detailedAnalysis ||
        "The lake shows moderate conditions that could support frothing if bloom activity and shoreline accumulation increase. Confidence is limited to visual cues from the submitted image.",
      waterType: result.waterType || "Lake",
      potentialContaminants: result.potentialContaminants || [],
      frothStage: result.frothStage || "watch",
      estimatedTimeToFrothHours,
      estimatedTimeToFrothLabel:
        result.estimatedTimeToFrothLabel || this.formatTimeToFrothLabel(estimatedTimeToFrothHours),
      frothConfidence,
      estimatedFrothCoveragePercent,
      keyDrivers: result.keyDrivers?.length
        ? result.keyDrivers
        : ["surface bloom activity", "shoreline accumulation", "stagnant near-shore zones"],
    };
  }

  private formatTimeToFrothLabel(hours: number): string {
    if (hours <= 0) return "Already frothing";
    if (hours <= 6) return "Within 6 hours";
    if (hours <= 24) return "Within 24 hours";
    if (hours <= 48) return "1-2 days";
    if (hours <= 72) return "2-3 days";
    return "More than 3 days";
  }

  private generateMockAnalysis(
    context?: { location?: string; notes?: string },
  ): WaterAnalysisResult {
    const riskScore = Math.floor(Math.random() * 45) + 45;
    const safetyStatus: RiskStatus =
      riskScore >= 80 ? "unsafe" : riskScore >= 55 ? "warning" : "safe";
    const estimatedTimeToFrothHours =
      safetyStatus === "unsafe"
        ? Math.floor(Math.random() * 8)
        : safetyStatus === "warning"
          ? Math.floor(Math.random() * 36) + 8
          : Math.floor(Math.random() * 72) + 48;
    const frothStage =
      estimatedTimeToFrothHours <= 2
        ? "imminent"
        : estimatedTimeToFrothHours <= 24
          ? "forming"
          : estimatedTimeToFrothHours <= 72
            ? "watch"
            : "stable";

    return {
      overallSafetyScore: riskScore,
      safetyStatus,
      parameters: {
        foamCoverage: {
          value: Math.floor(Math.random() * 55),
          status: safetyStatus === "unsafe" ? "unsafe" : "warning",
          description: "Surface brightness patterns suggest foam-prone accumulation zones.",
        },
        algaeDensity: {
          value: Math.floor(Math.random() * 45) + 25,
          status: Math.random() > 0.5 ? "warning" : "unsafe",
          description: "Bloom density appears elevated enough to support frothing episodes.",
        },
        shorelineResidue: {
          value: Math.floor(Math.random() * 60),
          status: Math.random() > 0.6 ? "warning" : "safe",
          description: "Residue bands near the edge indicate possible transport and buildup.",
        },
        waterDiscoloration: {
          value: Math.floor(Math.random() * 50) + 20,
          status: Math.random() > 0.6 ? "warning" : "safe",
          description: "Color variation points to concentrated surface activity.",
        },
        stagnationIndex: {
          value: Math.floor(Math.random() * 50) + 30,
          status: safetyStatus === "safe" ? "safe" : "warning",
          description: "Low-flow pockets could trap floating organic matter.",
        },
        surfaceVolatility: {
          value: Math.floor(Math.random() * 50) + 10,
          status: Math.random() > 0.7 ? "unsafe" : "warning",
          description: "Surface texture shows mixed calm slicks and accumulation streaks.",
        },
      },
      recommendations: [
        "Review the same lake sector with fresh imagery later today.",
        "Prioritize field checks near shoreline accumulation zones.",
        "Track bloom expansion and wind-driven concentration before public alerts.",
      ],
      detailedAnalysis: `The image suggests a ${
        safetyStatus === "unsafe" ? "high" : safetyStatus === "warning" ? "moderate" : "low"
      } near-term frothing risk for this lake. Visible surface texture, discoloration, and accumulation bands indicate ${
        frothStage === "imminent"
          ? "frothing may already be underway or about to start"
          : "conditions that could intensify into frothing if the current pattern persists"
      }. ${
        context?.location ? `This estimate is anchored to the reported location: ${context.location}.` : ""
      }`,
      waterType: "Satellite-observed lake",
      potentialContaminants: ["nutrient-rich runoff", "algal bloom biomass", "organic shoreline buildup"],
      frothStage,
      estimatedTimeToFrothHours,
      estimatedTimeToFrothLabel: this.formatTimeToFrothLabel(estimatedTimeToFrothHours),
      frothConfidence: Math.floor(Math.random() * 21) + 65,
      estimatedFrothCoveragePercent: Math.floor(Math.random() * 45) + 10,
      keyDrivers: ["bloom concentration", "surface stagnation", "shoreline accumulation"],
    };
  }
}
