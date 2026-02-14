import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import ThemeProvider from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mutech Labs - Project Manager",
  description: "A personal project and task management system",
};

const themeScript = `
(function() {
  function hexToHsl(hex) {
    var m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return '222.2 47.4% 11.2%';
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return Math.round(h * 360) + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%';
  }
  function fgFor(hex) {
    var m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return '210 40% 98%';
    var lum = 0.299 * (parseInt(m[1], 16) / 255) + 0.587 * (parseInt(m[2], 16) / 255) + 0.114 * (parseInt(m[3], 16) / 255);
    return lum > 0.5 ? '222.2 47.4% 11.2%' : '210 40% 98%';
  }
  try {
    var s = localStorage.getItem('cq-theme-prefs');
    if (s) {
      var p = JSON.parse(s);
      var isDark = p.theme_mode === 'dark' || (p.theme_mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      if (p.primary_color) {
        document.documentElement.style.setProperty('--brand-primary', p.primary_color);
        document.documentElement.style.setProperty('--primary', hexToHsl(p.primary_color));
        document.documentElement.style.setProperty('--primary-foreground', fgFor(p.primary_color));
      }
      if (p.secondary_color) document.documentElement.style.setProperty('--brand-secondary', p.secondary_color);
      if (p.third_color) document.documentElement.style.setProperty('--brand-third', p.third_color);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
