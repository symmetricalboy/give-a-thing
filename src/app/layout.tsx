import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Silkscreen } from "next/font/google";
import { eq } from "drizzle-orm";
import "./globals.css";
import { getDb, schema } from "@/db";
import { getCurrentSession } from "@/lib/session";
import { NavbarShell, type NavViewer } from "@/components/NavbarShell";

const fontBody = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const fontPixel = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://giveathing.com"
  ),
  title: {
    default: "Give a Thing",
    template: "%s | Give a Thing",
  },
  description: "Get a Pointless Thing Every Day & Give Things Away",
  openGraph: {
    type: "website",
    siteName: "Give a Thing",
    title: "Give a Thing",
    description: "Get a Pointless Thing Every Day & Give Things Away",
    url: "https://giveathing.com",
    images: [
      {
        url: "/cover.png",
        width: 1600,
        height: 900,
        alt: "Give a Thing — 16-bit mystery parcel and pointless inventory things",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Give a Thing",
    description: "Get a Pointless Thing Every Day & Give Things Away",
    images: ["/cover.png"],
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.png",
  },
};

async function loadViewer(): Promise<NavViewer | null> {
  try {
    const session = await getCurrentSession();
    if (!session) return null;
    const db = getDb();
    const rows = await db
      .select({
        did: schema.users.did,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(eq(schema.users.did, session.did))
      .limit(1);
    return rows[0] ?? { did: session.did, handle: session.handle };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await loadViewer();

  return (
    <html
      lang="en"
      className={`${fontBody.variable} ${fontPixel.variable}`}
    >
      <body className="antialiased">
        <NavbarShell viewer={viewer}>{children}</NavbarShell>
      </body>
    </html>
  );
}
