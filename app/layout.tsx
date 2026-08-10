import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Electro Roun | Electrodomésticos y hogar",
  description: "Catálogo Electro Roun. Productos para tu hogar con atención personalizada y cuotas fijas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
