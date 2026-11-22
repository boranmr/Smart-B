import { GoogleGenAI, Type } from '@google/genai';
import type { AICountResponse, BottleCapRule, Product } from '../src/types/inventory.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripDataUrlPrefix(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/jpeg', data: dataUrl };
}

export async function analyzeCameraFrameForProduct(params: {
  imageDataUrl: string;
  product: Product;
  bottleCapRule: BottleCapRule;
}): Promise<AICountResponse> {
  const ai = getGeminiClient();
  const { product, bottleCapRule } = params;
  const frame = stripDataUrlPrefix(params.imageDataUrl);

  const referenceParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const trainingPhotos = (product.recognitionProfile?.trainingPhotos || []).slice(0, 3);
  for (const photo of trainingPhotos) {
    if (photo.dataUrl) {
      const parsed = stripDataUrlPrefix(photo.dataUrl);
      referenceParts.push({
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.data,
        },
      });
    }
  }

  const ruleInstruction: Record<BottleCapRule, string> = {
    capped_only:
      'BOTTLE CAP RULE: ONLY count items that have a visible cap/lid closed on top. Any matching-brand bottle WITHOUT a cap must have capStatus="uncapped" and eligibleForCount=false.',
    sealed_only:
      'SEALED RULE: ONLY count items that appear factory-sealed with an intact seal/cap. Any opened or unsealed item must have capStatus="open" and eligibleForCount=false.',
    count_open_separately:
      'OPEN SEPARATE RULE: Sealed/capped matching items have eligibleForCount=true and capStatus="capped". Opened/uncapped matching items have capStatus="open" and eligibleForCount=false (so they are counted separately in openCount).',
    count_all:
      'COUNT ALL PRESENT: Count every physically present unit of the exact target product regardless of cap/seal state.',
  };

  const promptText = `You are an industrial computer-vision stock counting engine for Smart Inventory AI.
Your strict mandate is PRODUCT-SPECIFIC COUNTING. Never count objects indiscriminately.

TARGET PRODUCT TO COUNT:
- Product Name: ${product.name}
- Brand: ${product.brand}
- Size / Packaging: ${product.size} (${product.unit})
- SKU: ${product.sku}
- Barcode: ${product.barcode || 'N/A'}
- Recognition Profile Summary: ${product.recognitionProfile?.visualSignatureSummary || 'Not yet trained; rely on label OCR, brand typography, bottle/pack geometry, and color.'}
- Label Keywords: ${(product.recognitionProfile?.labelKeywords || []).join(', ') || `${product.brand}, ${product.name}`}
- Dominant Colors: ${(product.recognitionProfile?.dominantColors || []).join(', ') || 'See product metadata'}

${ruleInstruction[bottleCapRule]}

CRITICAL RULES:
1. Examine the LAST image (the live camera frame). Any earlier images are reference training photos of the target product.
2. Detect every visible instance of the TARGET PRODUCT ONLY.
3. Explicitly IGNORE all other brands, unrelated beverages, wrong sizes, or different products in the frame. List ignored brands/items you see in "ignoredBrands" and set "ignoredCount" to the count of non-matching items visible.
4. For each target product instance, inspect its top/cap/seal carefully. If you cannot clearly tell whether a cap/seal is present due to angle, lighting, or occlusion, set capStatus="uncertain", eligibleForCount=false, and set overall needsManualVerification=true.
5. Provide normalized bounding boxes [ymin, xmin, ymax, xmax] scaled 0 to 1000 for each target detection.
6. Set matchedCount = exact number of detections where eligibleForCount === true.
7. Set openCount = exact number of detections where capStatus === "open" or "uncapped" for the target product.
8. Set uncertainCount = exact number of detections where capStatus === "uncertain".`;

  const contentsParts = [
    ...referenceParts,
    { inlineData: { mimeType: frame.mimeType, data: frame.data } },
    { text: promptText },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts: contentsParts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matchedCount: { type: Type.INTEGER },
          openCount: { type: Type.INTEGER },
          uncertainCount: { type: Type.INTEGER },
          ignoredCount: { type: Type.INTEGER },
          ignoredBrands: { type: Type.ARRAY, items: { type: Type.STRING } },
          overallConfidence: { type: Type.NUMBER },
          needsManualVerification: { type: Type.BOOLEAN },
          summary: { type: Type.STRING },
          detections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                brandDetected: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                capStatus: {
                  type: Type.STRING,
                  enum: ['capped', 'uncapped', 'sealed', 'open', 'not_applicable', 'uncertain'],
                },
                eligibleForCount: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
                bbox: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
              },
            },
          },
        },
      },
    },
  });

  const text = (response.text || '{}').trim();
  return JSON.parse(text) as AICountResponse;
}

export async function buildProductRecognitionProfile(params: {
  productName: string;
  brand: string;
  size: string;
  images: { angle: string; dataUrl: string }[];
}) {
  const ai = getGeminiClient();
  const imageParts = params.images.slice(0, 5).map((img) => {
    const parsed = stripDataUrlPrefix(img.dataUrl);
    return {
      inlineData: {
        mimeType: parsed.mimeType,
        data: parsed.data,
      },
    };
  });

  const prompt = `Analyze these ${imageParts.length} training photographs of the product:
Name: ${params.productName}
Brand: ${params.brand}
Size: ${params.size}

Extract an accurate, discriminative visual recognition profile so future stock-counting camera scans can distinguish this exact SKU from competitor brands and other sizes.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [...imageParts, { text: prompt }],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          visualSignatureSummary: { type: Type.STRING },
          distinctiveFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
          labelKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          dominantColors: { type: Type.ARRAY, items: { type: Type.STRING } },
          packagingType: { type: Type.STRING },
        },
      },
    },
  });

  const text = (response.text || '{}').trim();
  return JSON.parse(text) as {
    visualSignatureSummary: string;
    distinctiveFeatures: string[];
    labelKeywords: string[];
    dominantColors: string[];
    packagingType: string;
  };
}
