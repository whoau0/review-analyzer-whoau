import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ReviewInput {
  review_no: number | string;
  written_on: string;
  rating: number;
  review_text: string;
}

interface AnalyzedReviewItem {
  review_no: number;
  written_on: string;
  rating: number;
  review_text: string;
  sentiment: "긍정" | "부정" | "중립" | "광고";
  categories: string;
  improvement_request: string | null;
  is_safety_issue: boolean;
  model_used: string;
}

export async function POST(req: NextRequest) {
  try {
    const { reviews } = await req.json();

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json(
        { error: "리뷰 데이터가 비어있거나 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY가 설정되지 않았습니다. .env.local 파일에 키를 입력해 주세요." },
        { status: 500 }
      );
    }

    const systemPrompt = `
당신은 생활가전 쇼핑몰 '하루살림'의 무선 핸디 청소기 「클린핏 미니」 전문 리뷰 데이터 분석기입니다.
제공된 리뷰 목록 전체를 분석 기준표에 따라 엄격하게 단 1회의 JSON 배열로 분석하여 응답하십시오.

[분석 기준표]
1. 감성 (sentiment): '긍정', '부정', '중립', '광고' 중 1개 필수 선택
   - '광고': 체험단, 원고료 지원, 무상 제공, 협찬, 할인 링크, 제휴 관련 리뷰 (예: [체험단], 업체로부터 무상 제공 등)
   - '부정': 제품 불만, 성능 부족, 고장/결함, AS 불만, 배송 지연, 또는 '반어법/비꼼'(예: "배송 정말 빠르네요^^ 12일만에 옴", "조용하네요 공사하는줄ㅋㅋ" 등)은 무조건 '부정'으로 분류.
   - '긍정': 만족, 추천, 칭찬
   - '중립': 단순 사실 기술, 보통, 긍/부정이 혼재되어 평이한 경우

2. 유형 (categories): 아래 허용된 카테고리 중 해당되는 모든 항목을 찾아 쉼표(,)와 공백으로 구분된 문자열로 작성하십시오. (복수 선택 허용)
   허용 카테고리: [배터리, 흡입력, 소음, 무게·사용감, 디자인, 관리·청소, 구성품, 품질·불량, 배송, 포장, 고객센터, 가격, 설명서, 기타]

3. 개선 요청 (improvement_request):
   고객이 제품/서비스에 대해 희망하거나 개선을 바라는 내용("~면 좋겠어요", "~해 주세요", "~있으면 좋겠다" 등)이 있으면 핵심 내용을 추출하고, 없으면 null로 지정하십시오.

4. 안전 이슈 (is_safety_issue):
   충전기/본체 뜨거움, 발열, 과열, 타는 냄새, 냄새, 연기, 감전, 스파크 등 안전/화재 위험 징후가 언급된 경우 무조건 true, 없으면 false.

반드시 원본 데이터의 review_no, written_on, rating, review_text를 그대로 보존하여 아래 JSON 배열 형식으로 반환하십시오.
[
  {
    "review_no": 1,
    "written_on": "2026-08-18",
    "rating": 5,
    "review_text": "원문...",
    "sentiment": "긍정",
    "categories": "흡입력, 무게·사용감",
    "improvement_request": null,
    "is_safety_issue": false
  }
]
`;

    const userPrompt = `다음 ${reviews.length}건의 리뷰를 분석해 주세요:\n` + JSON.stringify(reviews);

    // Call Gemini API with fallback
    let modelUsed = "gemini-3.8-flash";
    let geminiResponse: Response | null = null;

    const requestGemini = async (model: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      return await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });
    };

    try {
      geminiResponse = await requestGemini(modelUsed);

      // Fallback on 503 (or 5xx service overload)
      if (geminiResponse.status === 503) {
        console.warn("gemini-3.8-flash 503 Error. Retrying with gemini-3.5-flash-lite fallback...");
        modelUsed = "gemini-3.5-flash-lite";
        geminiResponse = await requestGemini(modelUsed);
      }
    } catch (netErr: any) {
      console.warn("Network error with gemini-3.8-flash, trying gemini-3.5-flash-lite fallback...", netErr);
      modelUsed = "gemini-3.5-flash-lite";
      geminiResponse = await requestGemini(modelUsed);
    }

    if (!geminiResponse || !geminiResponse.ok) {
      const errText = await geminiResponse?.text().catch(() => "");
      console.error(`Gemini API Error (${geminiResponse?.status}):`, errText);
      return NextResponse.json(
        { error: `Gemini API 호출에 실패했습니다 (${geminiResponse?.status || "Unknown"}).` },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      return NextResponse.json(
        { error: "Gemini로부터 분석 결과를 받아오지 못했습니다." },
        { status: 502 }
      );
    }

    let parsedResults: any[] = [];
    try {
      parsedResults = JSON.parse(rawContent);
    } catch (parseErr) {
      // Try extracting json array if wrapped in code block
      const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        parsedResults = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON 파싱 실패");
      }
    }

    if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
      return NextResponse.json(
        { error: "분석 결과 형식이 올바르지 않습니다." },
        { status: 502 }
      );
    }

    // Attach modelUsed and validate fields
    const validatedResults: AnalyzedReviewItem[] = parsedResults.map((item: any, idx: number) => {
      const original = reviews[idx] || {};
      const validSentiments = ["긍정", "부정", "중립", "광고"];
      let sentiment = validSentiments.includes(item.sentiment) ? item.sentiment : "중립";

      // Extra safeguard for ad keywords
      const text = item.review_text || original.review_text || "";
      if (/체험단|원고료|무상\s*제공|협찬|할인링크/.test(text)) {
        sentiment = "광고";
      }

      return {
        review_no: Number(item.review_no ?? original.review_no ?? (idx + 1)),
        written_on: String(item.written_on ?? original.written_on ?? ""),
        rating: Number(item.rating ?? original.rating ?? 0),
        review_text: String(item.review_text ?? original.review_text ?? ""),
        sentiment,
        categories: Array.isArray(item.categories) ? item.categories.join(", ") : String(item.categories || "기타"),
        improvement_request: item.improvement_request ? String(item.improvement_request) : null,
        is_safety_issue: Boolean(item.is_safety_issue),
        model_used: modelUsed,
      };
    });

    return NextResponse.json({
      modelUsed,
      results: validatedResults,
      totalCount: validatedResults.length,
    });
  } catch (error: any) {
    console.error("Analyze Route Error:", error);
    return NextResponse.json(
      { error: error?.message || "리뷰 분석 중 예기치 않은 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
