import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface SafetyStatResponse {
  totalCases: number;
  topReasons: { rank: number; reason: string; count: number }[];
  lastUpdated: string;
}

// In-memory cache for 24 hours
let safetyCache: {
  timestamp: number;
  data: SafetyStatResponse;
} | null = null;

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
  try {
    const now = Date.now();
    if (safetyCache && (now - safetyCache.timestamp < CACHE_DURATION_MS)) {
      return NextResponse.json({
        ...safetyCache.data,
        isCached: true,
      });
    }

    const apiKey = process.env.CONSUMER_SAFETY_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "불러오지 못했습니다" },
        { status: 500 }
      );
    }

    // Decoding key first in case it's already encoded, to prevent double-encoding
    let rawServiceKey = apiKey;
    try {
      if (apiKey.includes("%")) {
        rawServiceKey = decodeURIComponent(apiKey);
      }
    } catch {
      rawServiceKey = apiKey;
    }

    const allMatchedItems: any[] = [];

    // Fetch pages 1 to 3 (1000 items each, total 3000 items)
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const url = new URL("https://apis.data.go.kr/B551919/open-api/harm/reception");
      url.searchParams.set("serviceKey", rawServiceKey);
      url.searchParams.set("pageNo", String(pageNo));
      url.searchParams.set("numOfRows", "1000");
      url.searchParams.set("apiFormat", "json");

      const res = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`API response status: ${res.status}`);
      }

      const text = await res.text();
      let jsonData: any = null;

      try {
        jsonData = JSON.parse(text);
      } catch (pErr) {
        console.error(`Page ${pageNo} JSON parse error:`, text.slice(0, 200));
        throw new Error("공공데이터 JSON 응답 파싱 실패");
      }

      // Format can be response.body.items.item or response.body.items or body.items
      let items = jsonData?.response?.body?.items?.item ||
                    jsonData?.response?.body?.items ||
                    jsonData?.body?.items?.item ||
                    jsonData?.body?.items || [];

      if (!Array.isArray(items)) {
        if (typeof items === "object" && items !== null) {
          items = [items];
        } else {
          items = [];
        }
      }

      // Filter for "가정용 진공청소기"
      const filtered = items.filter((item: any) => {
        const itemMinor = String(item?.itemMinor || "").trim();
        return itemMinor === "가정용 진공청소기" || itemMinor.includes("진공청소기");
      });

      allMatchedItems.push(...filtered);

      // If page had 0 items, we can stop early
      if (items.length === 0) {
        break;
      }
    }

    // Aggregate by injuryReason
    const reasonCounts: Record<string, number> = {};
    for (const item of allMatchedItems) {
      const reason = String(item?.injuryReason || item?.harmReason || "기타/미상").trim() || "기타/미상";
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }

    const sortedReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const topReasons = sortedReasons.slice(0, 3).map((item, idx) => ({
      rank: idx + 1,
      reason: item.reason,
      count: item.count,
    }));

    const resultData: SafetyStatResponse = {
      totalCases: allMatchedItems.length,
      topReasons,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result
    safetyCache = {
      timestamp: now,
      data: resultData,
    };

    return NextResponse.json({
      ...resultData,
      isCached: false,
    });
  } catch (err: any) {
    console.error("Safety Stats API Error:", err);
    return NextResponse.json(
      { error: "불러오지 못했습니다" },
      { status: 500 }
    );
  }
}
