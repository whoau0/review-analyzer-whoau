"use client";

import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabaseClient";
import {
  UploadCloud,
  AlertTriangle,
  Flame,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Megaphone,
  ShieldAlert,
  BarChart3,
  ListOrdered,
  History,
  FileText,
  Save,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  Sparkles,
  Info,
} from "lucide-react";

interface ParsedReview {
  review_no: number;
  written_on: string;
  rating: number;
  review_text: string;
}

interface AnalyzedReview extends ParsedReview {
  sentiment: "긍정" | "부정" | "중립" | "광고";
  categories: string;
  improvement_request: string | null;
  is_safety_issue: boolean;
  model_used: string;
}

interface HistoryItem {
  analyzed_on: string;
  total_count: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  ad_count: number;
  negative_rate: number; // (negative / (total - ad)) * 100
  safety_issue_count: number;
  model_used: string;
}

interface SafetyStats {
  totalCases: number;
  topReasons: { rank: number; reason: string; count: number }[];
  lastUpdated?: string;
  isCached?: boolean;
}

export default function ReviewAnalyzerDashboard() {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Analysis Result
  const [analysisResults, setAnalysisResults] = useState<AnalyzedReview[]>([]);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [analyzedDate, setAnalyzedDate] = useState<string | null>(null);

  // Safety Public Data
  const [safetyStats, setSafetyStats] = useState<SafetyStats | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  // Supabase History
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Marketer's 3-line Action Plan (우리가 고칠 것)
  const [actionLines, setActionLines] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [actionSavedAlert, setActionSavedAlert] = useState(false);

  // Table Filter & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSentiment, setFilterSentiment] = useState<string>("ALL");
  const [onlySafetyFilter, setOnlySafetyFilter] = useState(false);
  const [onlyImprovementFilter, setOnlyImprovementFilter] = useState(false);

  // Load Initial Data (History, Safety Stats, LocalStorage Action Items)
  useEffect(() => {
    fetchSafetyStats();
    fetchHistory();

    const savedActions = localStorage.getItem("cleanfit_action_items");
    if (savedActions) {
      try {
        const parsed = JSON.parse(savedActions);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setActionLines([parsed[0] || "", parsed[1] || "", parsed[2] || ""]);
        }
      } catch (e) {
        console.error("Failed to load local action items", e);
      }
    }
  }, []);

  // 1. Fetch Consumer Safety Data
  const fetchSafetyStats = async () => {
    setSafetyLoading(true);
    setSafetyError(null);
    try {
      const res = await fetch("/api/safety-stats");
      if (!res.ok) {
        throw new Error("소비자원 데이터를 불러오지 못했습니다.");
      }
      const data = await res.json();
      if (data.error) {
        setSafetyError(data.error);
      } else {
        setSafetyStats(data);
      }
    } catch (err: any) {
      console.error(err);
      setSafetyError("불러오지 못했습니다");
    } finally {
      setSafetyLoading(false);
    }
  };

  // 2. Fetch Supabase History
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("review_analysis")
        .select("analyzed_on, sentiment, is_safety_issue, model_used")
        .order("analyzed_on", { ascending: false });

      if (error) {
        console.error("Failed to fetch history:", error);
        return;
      }

      if (data && data.length > 0) {
        // Group by analyzed_on
        const grouped: Record<string, any> = {};

        data.forEach((row) => {
          const date = row.analyzed_on || "미지정";
          if (!grouped[date]) {
            grouped[date] = {
              analyzed_on: date,
              total_count: 0,
              positive_count: 0,
              negative_count: 0,
              neutral_count: 0,
              ad_count: 0,
              safety_issue_count: 0,
              models: new Set<string>(),
            };
          }
          grouped[date].total_count += 1;
          if (row.sentiment === "긍정") grouped[date].positive_count += 1;
          else if (row.sentiment === "부정") grouped[date].negative_count += 1;
          else if (row.sentiment === "중립") grouped[date].neutral_count += 1;
          else if (row.sentiment === "광고") grouped[date].ad_count += 1;

          if (row.is_safety_issue) grouped[date].safety_issue_count += 1;
          if (row.model_used) grouped[date].models.add(row.model_used);
        });

        const historyArray: HistoryItem[] = Object.values(grouped).map(
          (item: any) => {
            const validTotal = item.total_count - item.ad_count;
            const negativeRate =
              validTotal > 0
                ? Number(((item.negative_count / validTotal) * 100).toFixed(1))
                : 0;

            return {
              analyzed_on: item.analyzed_on,
              total_count: item.total_count,
              positive_count: item.positive_count,
              negative_count: item.negative_count,
              neutral_count: item.neutral_count,
              ad_count: item.ad_count,
              negative_rate: negativeRate,
              safety_issue_count: item.safety_issue_count,
              model_used: Array.from(item.models).join(", ") || "gemini",
            };
          }
        );

        setHistoryList(historyArray);
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 3. Handle File Change & CSV Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setAnalysisError(null);
    setIsParsing(true);

    Papa.parse(selected, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setIsParsing(false);
        const rawData = results.data as any[];

        if (!rawData || rawData.length === 0) {
          setAnalysisError("CSV 파일에 유효한 데이터가 없습니다.");
          return;
        }

        // Map column names flexibly
        const parsedRows: ParsedReview[] = rawData.map((row, idx) => {
          const review_no = Number(
            row["번호"] || row["리뷰번호"] || row["no"] || row["id"] || idx + 1
          );
          const written_on = String(
            row["작성일"] || row["등록일"] || row["date"] || ""
          ).trim();
          const rating = Number(
            row["별점"] || row["평점"] || row["score"] || row["rating"] || 5
          );
          const review_text = String(
            row["리뷰"] ||
              row["리뷰내용"] ||
              row["내용"] ||
              row["본문"] ||
              row["content"] ||
              ""
          ).trim();

          return {
            review_no,
            written_on,
            rating,
            review_text,
          };
        }).filter((r) => r.review_text.length > 0);

        if (parsedRows.length === 0) {
          setAnalysisError("분석할 리뷰 텍스트 내용을 찾을 수 없습니다.");
          return;
        }

        // Run analysis API
        await executeAnalysis(parsedRows);
      },
      error: (err) => {
        setIsParsing(false);
        setAnalysisError(`CSV 파싱 실패: ${err.message}`);
      },
    });
  };

  // 4. Call Gemini Single Batch API & Save to Supabase
  const executeAnalysis = async (reviews: ParsedReview[]) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "분석 요청에 실패했습니다.");
      }

      const analyzedItems: AnalyzedReview[] = data.results;
      const currentModel = data.modelUsed;
      const today = new Date().toISOString().split("T")[0];

      setAnalysisResults(analyzedItems);
      setModelUsed(currentModel);
      setAnalyzedDate(today);

      // Save to Supabase
      setIsSaving(true);
      const rowsToInsert = analyzedItems.map((item) => ({
        analyzed_on: today,
        review_no: item.review_no,
        written_on: item.written_on,
        rating: item.rating,
        review_text: item.review_text,
        sentiment: item.sentiment,
        categories: item.categories,
        improvement_request: item.improvement_request,
        is_safety_issue: item.is_safety_issue,
        model_used: currentModel,
      }));

      const { error: insertError } = await supabase
        .from("review_analysis")
        .insert(rowsToInsert);

      if (insertError) {
        console.error("Supabase insert error:", insertError);
      } else {
        // Refresh history list
        await fetchHistory();
      }
      setIsSaving(false);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "리뷰 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 5. Save Marketer Action Plan (우리가 고칠 것)
  const saveActionPlan = () => {
    localStorage.setItem("cleanfit_action_items", JSON.stringify(actionLines));
    setActionSavedAlert(true);
    setTimeout(() => setActionSavedAlert(false), 2500);
  };

  // 6. Metrics Calculations
  const metrics = useMemo(() => {
    if (analysisResults.length === 0) return null;

    const total = analysisResults.length;
    let posCount = 0;
    let negCount = 0;
    let neuCount = 0;
    let adCount = 0;
    let safetyCount = 0;
    const categoryCount: Record<string, number> = {};

    analysisResults.forEach((r) => {
      if (r.sentiment === "긍정") posCount++;
      else if (r.sentiment === "부정") negCount++;
      else if (r.sentiment === "중립") neuCount++;
      else if (r.sentiment === "광고") adCount++;

      if (r.is_safety_issue) safetyCount++;

      if (r.categories) {
        const cats = r.categories.split(",").map((c) => c.trim()).filter(Boolean);
        cats.forEach((cat) => {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });
      }
    });

    const validTotal = total - adCount; // 광고(체험단) 제외
    const posRate = validTotal > 0 ? ((posCount / validTotal) * 100).toFixed(1) : "0.0";
    const negRate = validTotal > 0 ? ((negCount / validTotal) * 100).toFixed(1) : "0.0";
    const neuRate = validTotal > 0 ? ((neuCount / validTotal) * 100).toFixed(1) : "0.0";

    const sortedCategories = Object.entries(categoryCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      validTotal,
      posCount,
      negCount,
      neuCount,
      adCount,
      posRate,
      negRate,
      neuRate,
      safetyCount,
      sortedCategories,
    };
  }, [analysisResults]);

  // Filtered Reviews for Table
  const filteredReviews = useMemo(() => {
    return analysisResults.filter((r) => {
      if (searchTerm) {
        const text = (r.review_text + r.categories + (r.improvement_request || "")).toLowerCase();
        if (!text.includes(searchTerm.toLowerCase())) return false;
      }
      if (filterSentiment !== "ALL" && r.sentiment !== filterSentiment) {
        return false;
      }
      if (onlySafetyFilter && !r.is_safety_issue) {
        return false;
      }
      if (onlyImprovementFilter && !r.improvement_request) {
        return false;
      }
      return true;
    });
  }, [analysisResults, searchTerm, filterSentiment, onlySafetyFilter, onlyImprovementFilter]);

  const safetyReviews = useMemo(
    () => analysisResults.filter((r) => r.is_safety_issue),
    [analysisResults]
  );

  const improvementReviews = useMemo(
    () => analysisResults.filter((r) => Boolean(r.improvement_request)),
    [analysisResults]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                하루살림 「클린핏 미니」 리뷰 자동 분석기
              </h1>
              <p className="text-xs text-slate-500">
                인공지능 기반 단일 배치 감성 분석 & 한국소비자원 위해정보 연계 대시보드
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {modelUsed && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                응답 모델: {modelUsed}
              </div>
            )}
            {analyzedDate && (
              <span className="text-xs text-slate-400">
                분석일: {analyzedDate}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* 1. File Upload Section */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center transition hover:border-blue-400 hover:bg-blue-50/30">
            <UploadCloud className="h-12 w-12 text-blue-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900">
              분석할 리뷰 CSV 파일을 업로드하세요
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md">
              (번호, 작성일, 별점, 리뷰 본문이 포함된 CSV 파일을 선택하면 즉시 1회 배치 분석이 시작됩니다)
            </p>

            <div className="mt-4">
              <label className="relative inline-flex items-center gap-2 cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-700 active:scale-95">
                <span>{file ? file.name : "CSV 파일 선택하기"}</span>
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleFileUpload}
                  disabled={isParsing || isAnalyzing}
                />
              </label>
            </div>

            {(isParsing || isAnalyzing || isSaving) && (
              <div className="mt-4 flex items-center gap-2 text-sm text-blue-700 font-medium">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span>
                  {isParsing && "CSV 파일을 파싱하고 있습니다..."}
                  {isAnalyzing && "Gemini AI 모델로 단일 배치 리뷰 분석을 수행 중입니다..."}
                  {isSaving && "분석 결과를 Supabase 데이터베이스에 안전하게 기록하는 중..."}
                </span>
              </div>
            )}

            {analysisError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{analysisError}</span>
              </div>
            )}
          </div>
        </section>

        {/* 2. Analysis Metrics Overview (When results exist) */}
        {metrics && (
          <>
            {/* Top Stat Cards */}
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>총 리뷰 건수</span>
                  <FileText className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.total} <span className="text-xs font-normal text-slate-500">건</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  유효 분석: {metrics.validTotal}건 (광고 {metrics.adCount}건 제외)
                </div>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-green-700 font-medium">
                  <span>긍정 리뷰 비율</span>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-green-700">
                  {metrics.posRate}%
                </div>
                <div className="mt-1 text-xs text-green-600">
                  {metrics.posCount}건 (유효 리뷰 기준)
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-red-700 font-medium">
                  <span>부정 리뷰 비율</span>
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-red-700">
                  {metrics.negRate}%
                </div>
                <div className="mt-1 text-xs text-red-600">
                  {metrics.negCount}건 (반어법 포함)
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>중립 / 광고(제외)</span>
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.neuCount} / {metrics.adCount} <span className="text-xs font-normal text-slate-500">건</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  체험단/원고료 등 통계 제외됨
                </div>
              </div>

              <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-amber-800 font-semibold">
                  <span>안전 이슈 감지</span>
                  <Flame className="h-4 w-4 text-amber-600 animate-bounce" />
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-900">
                  {metrics.safetyCount} <span className="text-xs font-normal text-amber-700">건</span>
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  뜨거움/발열/타는냄새 등 리스크
                </div>
              </div>
            </section>

            {/* 3. Middle Section: Complaint Categories & Consumer Safety Side-by-Side */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left: Complaint Categories Ranking (7 cols) */}
              <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-slate-900 text-sm">
                      불만 / 주제 유형별 발생 순위
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">복수 태깅 집계</span>
                </div>

                <div className="mt-4 space-y-3">
                  {metrics.sortedCategories.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">집계된 카테고리가 없습니다.</p>
                  ) : (
                    metrics.sortedCategories.slice(0, 8).map((cat, index) => {
                      const maxCount = metrics.sortedCategories[0]?.count || 1;
                      const percentage = Math.round((cat.count / maxCount) * 100);
                      const isTop3 = index < 3;

                      return (
                        <div key={cat.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                  isTop3
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {index + 1}
                              </span>
                              <span className="text-slate-800">{cat.name}</span>
                            </span>
                            <span className="font-semibold text-slate-700">
                              {cat.count}건
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                index === 0
                                  ? "bg-blue-600"
                                  : index === 1
                                  ? "bg-blue-500"
                                  : index === 2
                                  ? "bg-blue-400"
                                  : "bg-slate-300"
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Consumer Safety Agency Stats (5 cols) */}
              <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-indigo-600" />
                      <h3 className="font-bold text-slate-900 text-sm">
                        한국소비자원 위해정보 (공공데이터)
                      </h3>
                    </div>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      가정용 진공청소기
                    </span>
                  </div>

                  <div className="mt-4">
                    {safetyLoading ? (
                      <div className="flex flex-col items-center justify-center py-8 text-xs text-slate-400">
                        <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 mb-2" />
                        <span>소비자원 위해정보 3,000건 조회 중...</span>
                      </div>
                    ) : safetyError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                        <p className="text-sm font-semibold text-red-700">{safetyError}</p>
                        <p className="mt-1 text-xs text-red-500">
                          (공공데이터 인증키를 확인하거나 잠시 후 다시 시도해 주세요)
                        </p>
                      </div>
                    ) : safetyStats ? (
                      <div className="space-y-4">
                        <div className="rounded-lg bg-indigo-50/60 p-3.5 text-center">
                          <span className="text-xs text-indigo-800 font-medium">
                            시장 내 진공청소기 총 접수 건수
                          </span>
                          <div className="mt-1 text-2xl font-black text-indigo-900">
                            {safetyStats.totalCases.toLocaleString()} <span className="text-sm font-normal">건</span>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-slate-600 mb-2">
                            주요 위해/사고 원인 순위 (TOP 3)
                          </h4>
                          <div className="space-y-2">
                            {safetyStats.topReasons.length === 0 ? (
                              <p className="text-xs text-slate-400">접수된 위해 원인이 없습니다.</p>
                            ) : (
                              safetyStats.topReasons.map((r) => (
                                <div
                                  key={r.rank}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white font-bold text-[11px]">
                                      {r.rank}
                                    </span>
                                    <span className="font-medium text-slate-800">{r.reason}</span>
                                  </span>
                                  <span className="font-bold text-indigo-700">{r.count}건</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-slate-400">
                        데이터를 불러오는 중입니다...
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>출처: 한국소비자원 위해정보 API</span>
                  <span>24시간 자동 캐시 적용</span>
                </div>
              </div>
            </section>

            {/* 4. Safety & Improvement Request Highlights */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Safety Issue Highlights */}
              <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-red-100">
                  <div className="flex items-center gap-2 text-red-700">
                    <Flame className="h-5 w-5 text-red-600" />
                    <h3 className="font-bold text-sm">
                      🚨 안전 리스크 집중 모니터링 ({safetyReviews.length}건)
                    </h3>
                  </div>
                  <span className="text-xs text-red-500 font-medium">
                    뜨거움·발열·냄새·연기 등
                  </span>
                </div>

                <div className="mt-4 max-h-64 overflow-y-auto space-y-2.5 pr-1">
                  {safetyReviews.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      안전 이슈가 감지된 리뷰가 없습니다.
                    </div>
                  ) : (
                    safetyReviews.map((r) => (
                      <div
                        key={r.review_no}
                        className="rounded-lg border border-red-100 bg-red-50/60 p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-semibold text-red-900">
                          <span>리뷰 #{r.review_no} ({r.written_on})</span>
                          <span className="rounded bg-red-200 px-1.5 py-0.5 text-[10px] text-red-800 font-bold">
                            평점 {r.rating}점
                          </span>
                        </div>
                        <p className="text-slate-800 leading-relaxed font-medium">
                          {r.review_text}
                        </p>
                        {r.categories && (
                          <div className="text-[11px] text-red-600">
                            유형: {r.categories}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Improvement Requests Highlights */}
              <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-sm">
                      💡 고객 개선 요청 사항 ({improvementReviews.length}건)
                    </h3>
                  </div>
                  <span className="text-xs text-blue-500 font-medium">
                    "~면 좋겠어요", "~해 주세요" 추출
                  </span>
                </div>

                <div className="mt-4 max-h-64 overflow-y-auto space-y-2.5 pr-1">
                  {improvementReviews.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      추출된 고객 개선 요청이 없습니다.
                    </div>
                  ) : (
                    improvementReviews.map((r) => (
                      <div
                        key={r.review_no}
                        className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-semibold text-blue-900">
                          <span>리뷰 #{r.review_no} ({r.written_on})</span>
                          <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[10px] text-blue-800 font-bold">
                            평점 {r.rating}점
                          </span>
                        </div>
                        <div className="rounded bg-white p-2 font-medium text-blue-950 border border-blue-100">
                          🎯 개선 요망: {r.improvement_request}
                        </div>
                        <p className="text-slate-600 text-[11px] truncate">
                          원문: {r.review_text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* 5. Marketer Action Plan (우리가 고칠 것 3줄 직접 입력 UI) */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5 text-slate-800" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      우리가 고칠 것 (마케터 직접 작성 3줄)
                    </h3>
                    <p className="text-xs text-slate-500">
                      * AI가 임의로 자동 작성하지 않으며, 실무자가 인사이트를 바탕으로 경영진 보고용 3줄 결론을 직접 정리합니다.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {actionSavedAlert && (
                    <span className="text-xs text-green-600 font-medium animate-fade-in">
                      ✓ 저장되었습니다
                    </span>
                  )}
                  <button
                    onClick={saveActionPlan}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800 transition active:scale-95"
                  >
                    <Save className="h-3.5 w-3.5" />
                    저장하기
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-700">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={actionLines[idx]}
                      onChange={(e) => {
                        const newLines = [...actionLines] as [string, string, string];
                        newLines[idx] = e.target.value;
                        setActionLines(newLines);
                      }}
                      placeholder={`개선 및 실행 조치 ${idx + 1}번째 항목을 입력하세요 (예: 상세페이지에 충전 및 모드별 실사용 시간 명시 등)`}
                      className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 6. Full Analyzed Review List Table */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    전체 리뷰 분석 상세 목록 ({filteredReviews.length}건)
                  </h3>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="내용 또는 유형 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Sentiment Filter */}
                  <select
                    value={filterSentiment}
                    onChange={(e) => setFilterSentiment(e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ALL">전체 감성</option>
                    <option value="긍정">긍정만</option>
                    <option value="부정">부정만</option>
                    <option value="중립">중립만</option>
                    <option value="광고">광고(체험단)만</option>
                  </select>

                  {/* Toggle Filters */}
                  <button
                    onClick={() => setOnlySafetyFilter(!onlySafetyFilter)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
                      onlySafetyFilter
                        ? "border-red-400 bg-red-50 text-red-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    🚨 안전이슈만
                  </button>

                  <button
                    onClick={() => setOnlyImprovementFilter(!onlyImprovementFilter)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
                      onlyImprovementFilter
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    💡 개선요청만
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 w-14">번호</th>
                      <th className="py-2.5 px-3 w-24">작성일</th>
                      <th className="py-2.5 px-2 w-14 text-center">별점</th>
                      <th className="py-2.5 px-3 w-20 text-center">감성</th>
                      <th className="py-2.5 px-3 w-36">유형</th>
                      <th className="py-2.5 px-4 min-w-[240px]">리뷰 본문</th>
                      <th className="py-2.5 px-3 min-w-[160px]">추출된 개선요청</th>
                      <th className="py-2.5 px-3 w-20 text-center">안전이슈</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredReviews.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          조건에 일치하는 리뷰가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredReviews.map((r) => {
                        const sentimentBadge = {
                          긍정: "bg-green-100 text-green-800 border-green-200",
                          부정: "bg-red-100 text-red-800 border-red-200",
                          중립: "bg-slate-100 text-slate-700 border-slate-200",
                          광고: "bg-purple-100 text-purple-800 border-purple-200",
                        }[r.sentiment] || "bg-slate-100 text-slate-700";

                        return (
                          <tr
                            key={r.review_no}
                            className={`hover:bg-slate-50/80 transition ${
                              r.is_safety_issue ? "bg-red-50/30" : ""
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              #{r.review_no}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                              {r.written_on}
                            </td>
                            <td className="py-2.5 px-2 text-center font-semibold text-amber-600">
                              ★ {r.rating}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-block rounded px-2 py-0.5 font-bold border text-[10px] ${sentimentBadge}`}
                              >
                                {r.sentiment}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              <div className="flex flex-wrap gap-1">
                                {r.categories.split(",").map((c, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                                  >
                                    {c.trim()}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-slate-800 leading-relaxed">
                              {r.review_text}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              {r.improvement_request ? (
                                <span className="font-medium text-blue-700 bg-blue-50/80 px-1.5 py-0.5 rounded border border-blue-100 inline-block">
                                  {r.improvement_request}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {r.is_safety_issue ? (
                                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                  <Flame className="h-3 w-3" />
                                  경고
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* 7. Bottom Section: Supabase Historical Analysis Trends */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  누적 분석 이력 및 지난달 추이 (Supabase DB 연동)
                </h3>
                <p className="text-xs text-slate-500">
                  매달 저장된 분석 데이터를 바탕으로 부정 비율 및 건수 추이를 비교합니다.
                </p>
              </div>
            </div>

            <button
              onClick={fetchHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-4">분석 실행일</th>
                  <th className="py-2.5 px-4 text-center">총 건수</th>
                  <th className="py-2.5 px-4 text-center">긍정</th>
                  <th className="py-2.5 px-4 text-center">부정</th>
                  <th className="py-2.5 px-4 text-center">중립</th>
                  <th className="py-2.5 px-4 text-center">광고(제외)</th>
                  <th className="py-2.5 px-4 text-center">부정 비율 (광고 제외)</th>
                  <th className="py-2.5 px-4 text-center">안전 이슈 건수</th>
                  <th className="py-2.5 px-4 text-center">사용 모델</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {historyList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {historyLoading ? "이력을 불러오는 중..." : "저장된 과거 분석 이력이 없습니다. 상단에서 CSV를 업로드하여 첫 분석을 시작하세요."}
                    </td>
                  </tr>
                ) : (
                  historyList.map((hist) => (
                    <tr key={hist.analyzed_on} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {hist.analyzed_on}
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-900">
                        {hist.total_count}건
                      </td>
                      <td className="py-2.5 px-4 text-center text-green-600 font-medium">
                        {hist.positive_count}건
                      </td>
                      <td className="py-2.5 px-4 text-center text-red-600 font-medium">
                        {hist.negative_count}건
                      </td>
                      <td className="py-2.5 px-4 text-center text-slate-500">
                        {hist.neutral_count}건
                      </td>
                      <td className="py-2.5 px-4 text-center text-purple-600">
                        {hist.ad_count}건
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 font-bold ${
                            hist.negative_rate > 30
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {hist.negative_rate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {hist.safety_issue_count > 0 ? (
                          <span className="font-bold text-red-600">
                            🚨 {hist.safety_issue_count}건
                          </span>
                        ) : (
                          <span className="text-slate-400">0건</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center text-[11px] text-slate-500 font-mono">
                        {hist.model_used}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
