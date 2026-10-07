import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하루살림 「클린핏 미니」 리뷰 자동 분석기",
  description: "CSV 리뷰 자동 감성 및 불만 유형 분석 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
