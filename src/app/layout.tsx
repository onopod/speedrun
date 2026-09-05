import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKY RUSH | スカイラッシュ",
  description: "坂とカーブを駆け抜けるWebGLランゲーム。WASD・スワイプ・ゲームパッドで全60スターを集めよう。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
