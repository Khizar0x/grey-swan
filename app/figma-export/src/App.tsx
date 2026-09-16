import { useState } from "react";
import heroBg from "@/imports/WhatsApp_Image_2026-09-15_at_23.10.42.jpeg";

// ─── Palette ───────────────────────────────────────────────────────────────
const C = {
  bg:          "#FAF7F2",
  surface:     "#FFFFFF",
  surface2:    "#F0EBE3",
  surfaceHover:"#F5F0E8",
  gold:        "#C9A24B",       // primary accent / CTAs
  accentSoft:  "#F0E8D4",
  primary:     "#C9A24B",
  primaryHov:  "#D9B25B",
  rust:        "#B85C42",       // attention only
  green:       "#3E8A5F",       // success
  emerald:     "#2C6B4F",       // secondary accent
  cream:       "#262220",       // primary text (dark on light bg)
  muted:       "#6B6259",
  faint:       "#9A9088",
  border:      "rgba(38,34,32,0.1)",
  navBg:       "rgba(250,247,242,0.96)",
  onAccent:    "#FFFFFF",       // text on colored buttons
  // aliases kept so unchanged code still compiles
  goldGrad:    "#C9A24B",
  greenGrad:   "#3E8A5F",
  heroBg:      "#FAF7F2",
  headlineGrad:"#262220",
};

const FONT_HEAD = "Helvetica, 'Helvetica Neue', Inter, sans-serif";

// ─── Icon atoms ────────────────────────────────────────────────────────────
const IconCamera = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconAlert = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconEye = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconArrowRight = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

// ─── Types ─────────────────────────────────────────────────────────────────
type Screen   = "home" | "list" | "detail" | "rentals" | "listings";
type Category = "All" | "Cameras" | "Drones" | "Music" | "Antique" | "Rare";

interface Listing {
  id: number;
  name: string;
  owner: string;
  rating: number;
  reviews: number;
  price: number;
  deposit: number;
  image: string;
  category: Category;
  description: string;
}

// ─── Data ──────────────────────────────────────────────────────────────────
const LISTINGS: Listing[] = [
  {
    id: 1,
    name: "Canon EOS R5",
    owner: "John S.",
    rating: 4.9,
    reviews: 34,
    price: 85,
    deposit: 500,
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=400&fit=crop&auto=format",
    category: "Cameras",
    description: "The Canon EOS R5 is a professional mirrorless camera with 45MP full-frame sensor, 8K RAW video, and in-body image stabilisation. Perfect for commercial shoots, weddings, or any situation where image quality matters. Comes with two batteries, charger, and original box. Well maintained and serviced regularly.",
  },
  {
    id: 2,
    name: "DJI Mavic 3 Pro",
    owner: "Sarah M.",
    rating: 4.8,
    reviews: 21,
    price: 120,
    deposit: 750,
    image: "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?w=600&h=400&fit=crop&auto=format",
    category: "Drones",
    description: "DJI Mavic 3 Pro with triple-camera Hasselblad system. Includes 3 batteries, ND filters, carry case, and charging hub. 43-minute flight time. Collection only — please bring proof of CAA registration.",
  },
  {
    id: 3,
    name: "Gibson Les Paul Standard",
    owner: "Tom R.",
    rating: 5.0,
    reviews: 12,
    price: 60,
    deposit: 350,
    image: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&h=400&fit=crop&auto=format",
    category: "Music",
    description: "2019 Gibson Les Paul Standard in Heritage Cherry Sunburst. Excellent condition with only light playing wear. Comes with hardshell case. Strings recently changed. Great for recording sessions or live shows.",
  },
  {
    id: 4,
    name: "Sony FX3 Cinema Camera",
    owner: "Priya K.",
    rating: 4.7,
    reviews: 18,
    price: 140,
    deposit: 800,
    image: "https://images.unsplash.com/photo-1495707902641-75cac588d2e9?w=600&h=400&fit=crop&auto=format",
    category: "Cameras",
    description: "Sony FX3 full-frame cinema camera. 4K 120fps, incredible low-light capability. Includes cage, two V-mount batteries, and Sony 24-70mm GM lens. Ideal for documentary, narrative, or music video work.",
  },
  {
    id: 5,
    name: "DeWalt Power Tool Set",
    owner: "Marcus L.",
    rating: 4.6,
    reviews: 29,
    price: 35,
    deposit: 150,
    image: "https://images.unsplash.com/photo-1683115099413-5b7d85c2950c?w=600&h=400&fit=crop&auto=format",
    category: "Rare",
    description: "Complete DeWalt 18V XR power tool set — drill, circular saw, jigsaw, sander, and two batteries. Perfect for a weekend renovation project. All tools in excellent working condition. Carry case included.",
  },
  {
    id: 6,
    name: "Autel EVO II Pro",
    owner: "Chloe W.",
    rating: 4.8,
    reviews: 9,
    price: 95,
    deposit: 600,
    image: "https://images.unsplash.com/photo-1508444845599-5c89863b1c44?w=600&h=400&fit=crop&auto=format",
    category: "Drones",
    description: "Autel EVO II Pro with 6K 1-inch sensor. Ideal for professional aerial photography and videography. Comes with 2 batteries, controller, and hard case. All in excellent condition.",
  },
];

type StatusStyle = { background: string; color: string; border: string };
// Positive/complete → green tint | Pending → amber tint | Attention → rust tint
const STATUS_STYLES: Record<string, StatusStyle> = {
  "Payment received":    { background: "rgba(201,162,62,0.10)",  color: "#B5893A", border: "1px solid rgba(201,162,62,0.22)" },
  "Deposit in place":    { background: "rgba(201,162,62,0.08)",  color: "#A57E35", border: "1px solid rgba(201,162,62,0.18)" },
  "Rental confirmed":    { background: "rgba(62,138,95,0.10)",   color: "#3E8A5F", border: "1px solid rgba(62,138,95,0.22)" },
  "Ready for collection":{ background: "rgba(201,162,62,0.10)",  color: "#B5893A", border: "1px solid rgba(201,162,62,0.22)" },
  "Rental in progress":  { background: "rgba(44,107,79,0.08)",   color: "#2C6B4F", border: "1px solid rgba(44,107,79,0.2)" },
  "Return due today":    { background: "rgba(184,92,66,0.10)",   color: "#B85C42", border: "1px solid rgba(184,92,66,0.22)" },
  "Rental completed":    { background: "rgba(38,34,32,0.06)",    color: "#6B6259", border: "1px solid rgba(38,34,32,0.12)" },
  "Deposit released":    { background: "rgba(62,138,95,0.10)",   color: "#3E8A5F", border: "1px solid rgba(62,138,95,0.22)" },
};

// ─── Shared atoms ──────────────────────────────────────────────────────────
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <svg className="w-3.5 h-3.5" style={{ fill: C.gold, color: C.gold }} viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="text-sm font-medium" style={{ color: C.cream }}>{rating}</span>
    </span>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  full,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "success" | "danger";
  full?: boolean;
  type?: "submit" | "button";
}) {
  const base = `${full ? "w-full" : ""} px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] hover:opacity-90`;
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: C.primary,  color: C.onAccent },
    secondary: { background: "transparent", color: C.cream, border: `1px solid ${C.border}` },
    ghost:     { background: "transparent", color: C.cream, border: `1px solid ${C.border}` },
    success:   { background: C.green,    color: C.onAccent },
    danger:    { background: "transparent", color: C.rust, border: `1px solid rgba(184,92,66,0.35)` },
  };
  return (
    <button type={type} onClick={onClick} className={base} style={styles[variant]}>
      {children}
    </button>
  );
}

function UploadBox() {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center py-8 cursor-pointer transition-all"
      style={{ border: `2px dashed ${C.border}`, background: "transparent" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.gold; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5" style={{ background: `rgba(38,34,32,0.05)`, border: `1px solid ${C.border}` }}>
        <svg className="w-5 h-5" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5" style={{ color: C.muted }}>
        <IconCamera />
        <p className="text-sm font-medium">Upload photos</p>
      </div>
      <p className="text-xs mt-0.5" style={{ color: C.faint }}>PNG, JPG · 2–3 photos</p>
    </div>
  );
}

function TrustNote() {
  return (
    <div className="flex items-start gap-2.5">
      <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs leading-relaxed" style={{ color: C.faint }}>A few photos at each handover help keep the rental clear and fair for everyone.</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: C.muted }}>{label}</label>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  background: `rgba(38,34,32,0.04)`,
  border: `1px solid ${C.border}`,
  color: C.cream,
  borderRadius: "0.75rem",
  padding: "0.75rem 1rem",
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
};

// ─── Wallet modal ──────────────────────────────────────────────────────────
function WalletModal({ onClose, onConnect }: { onClose: () => void; onConnect: (w: string) => void }) {
  const wallets = [
    { name: "Phantom",  icon: "👻", desc: "Most popular Solana wallet" },
    { name: "Backpack", icon: "🎒", desc: "Multi-chain wallet by Coral" },
    { name: "Solflare", icon: "🌟", desc: "The OG Solana wallet" },
    { name: "Glow",     icon: "✨", desc: "Clean & simple wallet" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Connect a wallet</h3>
            <p className="text-sm mt-0.5" style={{ color: C.muted }}>Choose your preferred wallet to continue</p>
          </div>
          <button onClick={onClose} className="p-1 transition-opacity hover:opacity-60" style={{ color: C.faint }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={() => onConnect(w.name)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all"
              style={{ border: `1px solid ${C.border}`, background: "transparent" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.gold; (e.currentTarget as HTMLButtonElement).style.background = `rgba(201,162,75,0.08)`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span className="text-2xl">{w.icon}</span>
              <div>
                <div className="font-medium" style={{ color: C.cream }}>{w.name}</div>
                <div className="text-xs" style={{ color: C.faint }}>{w.desc}</div>
              </div>
              <svg className="w-4 h-4 ml-auto" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
        <div className="px-6 pb-5 text-center">
          <p className="text-xs" style={{ color: C.faint }}>By connecting, you agree to Grey Swan's terms of service</p>
        </div>
      </div>
    </div>
  );
}

// ─── Nav ───────────────────────────────────────────────────────────────────
function Nav({
  screen, setScreen, walletConnected, walletAddress, solBalance, onConnectClick, isHero,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  walletConnected: boolean;
  walletAddress: string;
  solBalance: number;
  onConnectClick: () => void;
  isHero?: boolean;
}) {
  // When floating over the hero photo: transparent bg, white text
  // When over page content: warm frosted backing, dark text
  const navText  = isHero ? "#FFFFFF"                    : C.cream;
  const navMuted = isHero ? "rgba(255,255,255,0.72)"     : C.muted;
  const navActiveBg = isHero ? "rgba(255,255,255,0.14)"  : `rgba(38,34,32,0.06)`;
  const searchBg    = isHero ? "rgba(255,255,255,0.12)"  : `rgba(38,34,32,0.05)`;
  const searchBorder = isHero ? "rgba(255,255,255,0.28)" : C.border;
  const searchColor  = isHero ? "#FFFFFF"                : C.cream;
  const searchPlaceholder = isHero ? "rgba(255,255,255,0.55)" : C.faint;

  return (
    <nav
      className="sticky top-0 z-50 transition-all duration-200"
      style={
        isHero
          ? { background: "transparent", borderBottom: "none" }
          : { background: C.navBg, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}` }
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-16">
        {/* Logo */}
        <button onClick={() => setScreen("home")} className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.primary }}>
            <svg className="w-4 h-4" style={{ color: C.onAccent }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
          <span className="font-semibold text-lg tracking-tight" style={{ fontFamily: FONT_HEAD, color: navText }}>Grey Swan</span>
        </button>

        {/* Search */}
        <div className="hidden md:flex flex-1 max-w-md">
          <div className="relative w-full">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: searchPlaceholder }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search for cameras, tools, instruments..."
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none transition-colors"
              style={{
                background: searchBg,
                border: `1px solid ${searchBorder}`,
                color: searchColor,
                backdropFilter: isHero ? "blur(8px)" : undefined,
              }}
            />
          </div>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1 ml-2">
          {(["home", "rentals", "listings"] as Screen[]).map((s) => (
            <button
              key={s}
              onClick={() => setScreen(s)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                color: screen === s ? navText : navMuted,
                background: screen === s ? navActiveBg : "transparent",
              }}
            >
              {s === "home" ? "Explore rentals" : s === "rentals" ? "Your rentals" : "Your listings"}
            </button>
          ))}
        </div>

        {/* Wallet */}
        <div className="ml-auto shrink-0">
          {walletConnected ? (
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all"
              style={
                isHero
                  ? { background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(8px)" }
                  : { background: `rgba(38,34,32,0.05)`, border: `1px solid ${C.border}` }
              }
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: C.green }} />
              <span className="text-sm font-mono" style={{ color: isHero ? "rgba(255,255,255,0.85)" : C.muted }}>{walletAddress}</span>
              <span className="text-sm font-semibold" style={{ color: isHero ? "#FFFFFF" : C.gold }}>{solBalance} SOL</span>
            </div>
          ) : (
            <button
              onClick={onConnectClick}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={
                isHero
                  ? { background: "#FFFFFF", color: "#1A1A1A", boxShadow: "0 1px 8px rgba(0,0,0,0.18)" }
                  : { background: C.primary, color: C.onAccent }
              }
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── Listing card ──────────────────────────────────────────────────────────
function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer group transition-all hover:-translate-y-0.5"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = `rgba(201,162,75,0.4)`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
      onClick={onClick}
    >
      <div className="relative overflow-hidden aspect-[4/3]" style={{ background: "#EDE7DC" }}>
        <img
          src={listing.image}
          alt={listing.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ filter: "brightness(1.0) saturate(0.9) sepia(0.05)" }}
        />
        <div className="absolute top-3 right-3">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "rgba(250,247,242,0.88)", border: `1px solid ${C.border}`, color: C.muted, backdropFilter: "blur(6px)" }}>
            {listing.category}
          </span>
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-base leading-snug mb-1 transition-colors group-hover:opacity-80" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {listing.name}
        </h3>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm" style={{ color: C.faint }}>{listing.owner}</span>
          <span style={{ color: C.border }}>·</span>
          <StarRating rating={listing.rating} />
          <span className="text-xs" style={{ color: C.faint }}>({listing.reviews})</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div>
              <span className="font-bold text-lg" style={{ color: C.cream }}>£{listing.price}</span>
              <span className="text-sm" style={{ color: C.faint }}>/week</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: C.faint }}>+ £{listing.deposit} deposit (refundable)</div>
          </div>
          <button
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0"
            style={{ background: C.primary, color: C.onAccent }}
          >
            Rent Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Home screen ───────────────────────────────────────────────────────────
function HomeScreen({ setScreen, setDetailListing }: { setScreen: (s: Screen) => void; setDetailListing: (l: Listing) => void }) {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const categories: Category[] = ["All", "Cameras", "Drones", "Music", "Antique", "Rare"];
  const filtered = activeCategory === "All" ? LISTINGS : LISTINGS.filter((l) => l.category === activeCategory);

  return (
    <div>
      {/* ── Hero ── pulled up -64px so the image sits behind the transparent nav */}
      <div
        className="relative overflow-hidden"
        style={{
          marginTop: "-64px",          /* slide behind the sticky nav */
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center 28%",
        }}
      >
        {/* Soft bottom fade — dissolves into the warm off-white page below */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(250,247,242,0.85))" }}
        />

        {/* Content wrapper — pt-16 clears the nav, then generous hero padding */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6" style={{ paddingTop: "calc(64px + 6rem)", paddingBottom: "6rem" }}>
          <div className="max-w-2xl relative">
            {/* Radial readability vignette — sits behind this content block only */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-3rem -4rem -4rem -3rem",
                background: "radial-gradient(ellipse at 30% 60%, rgba(8,14,24,0.52) 0%, rgba(8,14,24,0.28) 55%, transparent 80%)",
                filter: "blur(8px)",
                zIndex: 0,
              }}
            />

            {/* All content sits above the vignette */}
            <div className="relative" style={{ zIndex: 1 }}>
              {/* Trust badge */}
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
                style={{
                  border: "1px solid rgba(255,255,255,0.30)",
                  background: "rgba(255,255,255,0.10)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#fff" }} />
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.93)" }}>Available in your area</span>
              </div>

              {/* Headline */}
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-5"
                style={{ fontFamily: FONT_HEAD, color: "#FFFFFF", textShadow: "0 1px 12px rgba(0,0,0,0.20)" }}
              >
                Rent what you need.
                <br />
                Earn from what you own.
              </h1>

              {/* Subtext */}
              <p
                className="text-lg md:text-xl mb-8 leading-relaxed max-w-xl"
                style={{ color: "rgba(255,255,255,0.76)" }}
              >
                Grey Swan brings people together to rent useful things simply, safely, and on clear terms.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3 mb-10">
                <button
                  onClick={() => setScreen("home")}
                  className="px-6 py-3 rounded-xl text-base font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: "#16191E",
                    color: "#FFFFFF",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.32)",
                  }}
                >
                  Explore rentals
                </button>
                <button
                  onClick={() => setScreen("list")}
                  className="px-6 py-3 rounded-xl text-base font-semibold transition-all active:scale-95"
                  style={{
                    color: "#FFFFFF",
                    border: "1px solid rgba(255,255,255,0.42)",
                    background: "rgba(255,255,255,0.08)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  List something
                </button>
              </div>

              {/* Trust line */}
              <div className="pt-7" style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
                <p className="font-semibold text-sm mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>A better way to rent between people.</p>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.58)" }}>Clear terms. Protected payments. More control for everyone involved.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Listings */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {/* Category filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all"
              style={
                activeCategory === cat
                  ? { background: `rgba(201,162,75,0.14)`, color: C.gold, border: `1px solid rgba(201,162,75,0.4)` }
                  : { background: `rgba(38,34,32,0.04)`, color: C.muted, border: `1px solid ${C.border}` }
              }
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onClick={() => { setDetailListing(listing); setScreen("detail"); }}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "4rem" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm" style={{ color: C.faint }}>© 2026 Grey Swan Ltd. All rights reserved.</span>
          <div className="flex items-center gap-6 text-sm" style={{ color: C.faint }}>
            <a href="#" className="transition-opacity hover:opacity-70">Terms</a>
            <a href="#" className="transition-opacity hover:opacity-70">Privacy</a>
            <a href="#" className="transition-opacity hover:opacity-70">Need help?</a>
            <span style={{ color: "#4a4440" }}>Built on Solana</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List screen ───────────────────────────────────────────────────────────
function ListScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ background: C.primary }}>
          <svg className="w-8 h-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Listing created</h2>
        <p className="mb-8" style={{ color: C.muted }}>Your item is now visible to people looking to rent. You'll hear from us when someone expresses interest.</p>
        <Btn onClick={() => setScreen("listings")}>View your listings</Btn>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          Put what you own to work
        </h1>
        <p className="text-lg" style={{ color: C.muted }}>List something you're not using and decide when you're happy to rent it out.</p>
      </div>

      <div className="grid md:grid-cols-[1fr_240px] gap-8">
        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="flex flex-col gap-6">
          {/* Photo upload */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: C.muted }}>Photos</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); }}
              className="rounded-2xl flex flex-col items-center justify-center py-12 cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragging ? C.gold : C.border}`,
                background: dragging ? `rgba(201,162,75,0.08)` : "transparent",
              }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: `rgba(38,34,32,0.05)`, border: `1px solid ${C.border}` }}>
                <svg className="w-6 h-6" style={{ color: C.faint }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-medium mb-1" style={{ color: C.muted }}>Drag photos here or click to upload</p>
              <p className="text-sm" style={{ color: C.faint }}>PNG, JPG up to 10MB · up to 8 photos</p>
            </div>
          </div>

          <Field label="Item name">
            <input type="text" placeholder="e.g. Canon EOS Camera" required style={INPUT_STYLE} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Rental price per week">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.faint }}>£</span>
                <input type="number" placeholder="0" min="1" required style={{ ...INPUT_STYLE, paddingLeft: "2rem" }} />
              </div>
            </Field>
            <Field label="Refundable deposit">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.faint }}>£</span>
                <input type="number" placeholder="0" min="0" required style={{ ...INPUT_STYLE, paddingLeft: "2rem" }} />
              </div>
            </Field>
          </div>

          <Field label="Description">
            <textarea rows={5} placeholder="Describe your item, its condition, and what's included" required
              style={{ ...INPUT_STYLE, resize: "none" }} />
          </Field>

          <Field label="Category">
            <select required style={{ ...INPUT_STYLE, cursor: "pointer", appearance: "none", background: C.surface }}>
              <option value="">Select a category</option>
              <option>Cameras</option><option>Drones</option><option>Music</option>
              <option>Antique</option><option>Rare</option>
            </select>
          </Field>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl text-base font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: C.primary, color: C.onAccent }}
          >
            Create a listing
          </button>
        </form>

        {/* Sidebar tips */}
        <div className="flex flex-col gap-4 h-fit">
          {[
            { icon: "💷", title: "You choose the price.", body: "Set whatever weekly rate works for you. You can adjust it any time." },
            { icon: "🔒", title: "You choose the deposit.", body: "Decide on a deposit amount that gives you peace of mind." },
            { icon: "📸", title: "Photos protect everyone.", body: "A few photos at handover keep the rental clear and fair for both sides." },
          ].map((tip) => (
            <div key={tip.title} className="p-4 rounded-xl" style={{ background: `rgba(38,34,32,0.03)`, border: `1px solid ${C.border}` }}>
              <div className="text-xl mb-2">{tip.icon}</div>
              <p className="text-sm font-semibold mb-1" style={{ fontFamily: FONT_HEAD, color: C.cream }}>{tip.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: C.faint }}>{tip.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Detail screen ─────────────────────────────────────────────────────────
function DetailScreen({ listing, setScreen }: { listing: Listing; setScreen: (s: Screen) => void }) {
  const [renting, setRenting] = useState(false);
  if (renting) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ background: C.primary }}>
          <svg className="w-8 h-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Rental confirmed!</h2>
        <p className="mb-8" style={{ color: C.muted }}>Your rental for the {listing.name} has been confirmed. You can track it in your rentals dashboard.</p>
        <Btn onClick={() => setScreen("rentals")}>View your rentals</Btn>
      </div>
    );
  }
  const total = listing.price + listing.deposit;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={() => setScreen("home")} className="flex items-center gap-2 text-sm mb-8 transition-opacity hover:opacity-70" style={{ color: C.muted }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to listings
      </button>

      <div className="grid md:grid-cols-[1fr_380px] gap-10">
        <div>
          <div className="rounded-2xl overflow-hidden aspect-[16/9] mb-6" style={{ background: "#EDE7DC" }}>
            <img src={listing.image} alt={listing.name} className="w-full h-full object-cover" style={{ filter: "brightness(1.0) saturate(0.9) sepia(0.05)" }} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: `rgba(38,34,32,0.05)`, border: `1px solid ${C.border}`, color: C.muted }}>
              {listing.category}
            </span>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>{listing.name}</h1>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm" style={{ color: C.muted }}>Listed by {listing.owner}</span>
            <span style={{ color: C.border }}>·</span>
            <StarRating rating={listing.rating} />
            <span className="text-sm" style={{ color: C.faint }}>({listing.reviews} reviews)</span>
          </div>
          <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
            <h3 className="font-semibold mb-3" style={{ fontFamily: FONT_HEAD, color: C.cream }}>About this item</h3>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{listing.description}</p>
          </div>
        </div>

        {/* Booking panel */}
        <div>
          <div className="sticky top-24 rounded-2xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="mb-5">
              <span className="text-3xl font-bold" style={{ color: C.cream }}>£{listing.price}</span>
              <span className="text-base" style={{ color: C.faint }}>/week</span>
            </div>
            <div className="flex flex-col gap-3 mb-6">
              <label className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: C.faint }}>Rental period</label>
              <div className="grid grid-cols-2 gap-2">
                {["From", "To"].map((label) => (
                  <div key={label}>
                    <label className="text-xs mb-1 block" style={{ color: C.faint }}>{label}</label>
                    <input type="date" className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none transition-colors" style={{ background: `rgba(38,34,32,0.04)`, border: `1px solid ${C.border}`, color: C.cream, colorScheme: "light" as any }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mb-5" style={{ borderTop: `1px solid ${C.border}`, paddingTop: "1rem" }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>£{listing.price} × 1 week</span>
                <span style={{ color: C.muted }}>£{listing.price}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: C.muted }}>Refundable deposit</span>
                <span style={{ color: C.muted }}>£{listing.deposit}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2.5 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.cream }}>Total due now</span>
                <span style={{ color: C.cream }}>£{total}</span>
              </div>
            </div>
            <button
              onClick={() => setRenting(true)}
              className="w-full py-3.5 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.99] mb-3"
              style={{ background: C.primary, color: C.onAccent }}
            >
              Rent Now
            </button>
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl" style={{ border: `1px solid rgba(62,138,95,0.22)`, background: `rgba(62,138,95,0.08)` }}>
              <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: C.green }}>Your deposit stays safely held until the rental is completed.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rental handover flow ──────────────────────────────────────────────────
type RentalStep = 1 | 2 | 3 | 4;

function RentalDetailExpanded({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<RentalStep>(1);
  const [showDispute, setShowDispute] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 mx-auto" style={{ background: C.primary }}>
          <svg className="w-8 h-8" style={{ color: C.onAccent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Rental complete</h2>
        <p className="mb-8" style={{ color: C.muted }}>The rental has been confirmed and the deposit has been released to the renter. Thank you for using Grey Swan.</p>
        <Btn onClick={onBack}>Back to your listings</Btn>
      </div>
    );
  }

  const stepLabels = ["Send item", "Renter receives", "Return item", "Owner checks"];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-8 transition-opacity hover:opacity-70" style={{ color: C.muted }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to rentals
      </button>

      {/* Step progress */}
      <div className="flex items-center gap-0 mb-10">
        {[1, 2, 3, 4].map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
              style={
                step > s
                  ? { background: C.primary, color: C.onAccent }
                  : step === s
                  ? { background: C.primary, color: C.onAccent }
                  : { background: `rgba(38,34,32,0.04)`, border: `1px solid ${C.border}`, color: C.faint }
              }
            >
              {step > s ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            {i < 3 && <div className="h-px flex-1 mx-1 transition-all" style={{ background: step > s ? `rgba(62,138,95,0.35)` : C.border }} />}
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-8" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium mb-4" style={{ background: `rgba(201,162,75,0.12)`, border: `1px solid rgba(201,162,75,0.25)`, color: C.gold }}>
                Owner · Before sending
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Show the item before it's sent</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Add 2–3 clear photos showing its current condition.</p>
            </div>
            <UploadBox />
            <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.muted }}>Tracking number</label>
              <p className="text-xs mb-3" style={{ color: C.faint }}>Add the tracking number so you and the renter can follow the delivery.</p>
              <input type="text" placeholder="Enter tracking number" style={INPUT_STYLE} />
            </div>
            <TrustNote />
            <Btn onClick={() => setStep(2)} full>Continue</Btn>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium mb-4" style={{ background: `rgba(196,102,79,0.12)`, border: `1px solid rgba(196,102,79,0.25)`, color: C.rust }}>
                Renter · On arrival
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Show us what arrived</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Add 2–3 clear photos of the item as you received it.</p>
            </div>
            <UploadBox />
            <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
              <h3 className="font-semibold mb-1" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Everything arrived as expected</h3>
              <p className="text-sm mb-4" style={{ color: C.muted }}>Confirm once you've received the item and had a chance to check it.</p>
              <Btn onClick={() => setStep(3)} full>Confirm receipt</Btn>
            </div>
            <TrustNote />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium mb-4" style={{ background: `rgba(201,162,75,0.12)`, border: `1px solid rgba(201,162,75,0.25)`, color: C.gold }}>
                Renter · Before returning
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Show the item before you send it back</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Add 2–3 clear photos showing its condition before return.</p>
            </div>
            <UploadBox />
            <div className="pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.muted }}>Return tracking number</label>
              <p className="text-xs mb-3" style={{ color: C.faint }}>Add the tracking number so you and the owner can follow the return.</p>
              <input type="text" placeholder="Enter tracking number" style={INPUT_STYLE} />
            </div>
            <TrustNote />
            <Btn onClick={() => setStep(4)} full>Continue</Btn>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium mb-4" style={{ background: `rgba(62,138,95,0.10)`, border: `1px solid rgba(62,138,95,0.22)`, color: C.green }}>
                Owner · On return
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Check the item after its return</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Add 2–3 clear photos showing the condition it arrived back in.</p>
            </div>
            <UploadBox />
            <TrustNote />
            {showDispute ? (
              <div className="p-4 rounded-xl" style={{ border: `1px solid rgba(184,92,66,0.28)`, background: `rgba(184,92,66,0.08)` }}>
                <p className="text-sm leading-relaxed" style={{ color: C.rust }}>We'll review the photos from each stage of the rental and look into what happened. Our team will be in touch within 24 hours. You can also <a href="#" className="underline">contact us</a> directly.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setConfirmed(true)}
                    className="py-3 rounded-xl font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                    style={{ background: C.primary, color: C.onAccent }}
                  >
                    <IconCheck />
                    Confirm everything's fine
                  </button>
                  <p className="text-xs text-center leading-relaxed" style={{ color: C.faint }}>Confirm the return and the renter's deposit will be released automatically.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setShowDispute(true)}
                    className="py-3 rounded-xl font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
                    style={{ color: C.rust, border: `1px solid rgba(184,92,66,0.35)`, background: `rgba(184,92,66,0.07)` }}
                  >
                    <IconAlert />
                    Something's not right
                  </button>
                  <p className="text-xs text-center leading-relaxed" style={{ color: C.faint }}>If something has changed or isn't as expected, let us know.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rentals screen ────────────────────────────────────────────────────────
const ACTIVE_RENTALS = [
  { id: "r1", name: "Canon EOS R5", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=200&h=140&fit=crop&auto=format", status: "Rental in progress", dates: "12–19 September", deposit: 500 },
  { id: "r2", name: "Gibson Les Paul Standard", image: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=140&fit=crop&auto=format", status: "Ready for collection", dates: "15–22 September", deposit: 350 },
];

function RentalsScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (expanded) return <RentalDetailExpanded onBack={() => setExpanded(null)} />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Your rentals</h1>
      <p className="text-sm mb-8" style={{ color: C.faint }}>Items you're currently renting from others.</p>
      <div className="flex flex-col gap-4">
        {ACTIVE_RENTALS.map((r) => (
          <div key={r.id} className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex gap-4 p-5">
              <div className="w-24 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: "#EDE7DC" }}>
                <img src={r.image} alt={r.name} className="w-full h-full object-cover" style={{ filter: "brightness(0.96) saturate(0.9)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-base" style={{ fontFamily: FONT_HEAD, color: C.cream }}>{r.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0" style={STATUS_STYLES[r.status]}>{r.status}</span>
                </div>
                <p className="text-sm mb-1" style={{ color: C.muted }}>{r.dates}</p>
                <p className="text-xs" style={{ color: C.faint }}>£{r.deposit} deposit safely held</p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setExpanded(r.id)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
                style={{ color: C.cream, border: C.border, background: "transparent" }}
              >
                <IconEye />
                View rental
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Listings screen ───────────────────────────────────────────────────────
const OWNER_LISTINGS = [
  { id: "l1", name: "DJI Mavic 3 Pro", image: "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?w=200&h=140&fit=crop&auto=format", renter: "Alex T.", status: "Rental in progress", deposit: 750 },
  { id: "l2", name: "Sony FX3 Cinema Camera", image: "https://images.unsplash.com/photo-1495707902641-75cac588d2e9?w=200&h=140&fit=crop&auto=format", renter: "Jade L.", status: "Return due today", deposit: 800 },
  { id: "l3", name: "Autel EVO II Pro", image: "https://images.unsplash.com/photo-1508444845599-5c89863b1c44?w=200&h=140&fit=crop&auto=format", renter: null, status: "Deposit released", deposit: 0 },
];

function ListingsScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (expandedId) return <RentalDetailExpanded onBack={() => setExpandedId(null)} />;

  const active = OWNER_LISTINGS.filter((l) => l.renter !== null);
  const totalDeposit = active.reduce((sum, l) => sum + l.deposit, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: FONT_HEAD, color: C.cream }}>Your listings</h1>
          <p className="text-sm" style={{ color: C.faint }}>Items you've listed for others to rent.</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold" style={{ color: C.cream }}>{active.length} active rentals</p>
          <p className="text-sm" style={{ color: C.faint }}>£{totalDeposit.toLocaleString()} deposit safely held</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {OWNER_LISTINGS.map((l) => (
          <div key={l.id} className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex gap-5 p-5 flex-col sm:flex-row">
              <div className="w-full sm:w-28 h-20 rounded-xl overflow-hidden shrink-0" style={{ background: "#EDE7DC" }}>
                <img src={l.image} alt={l.name} className="w-full h-full object-cover" style={{ filter: "brightness(0.96) saturate(0.9)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-base" style={{ fontFamily: FONT_HEAD, color: C.cream }}>{l.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0" style={STATUS_STYLES[l.status]}>{l.status}</span>
                </div>
                {l.renter
                  ? <p className="text-sm mb-1" style={{ color: C.muted }}>Rented by <span style={{ color: C.cream }}>{l.renter}</span></p>
                  : <p className="text-sm mb-1" style={{ color: C.faint }}>No active renter</p>
                }
                {l.deposit > 0 && <p className="text-xs" style={{ color: C.faint }}>£{l.deposit} deposit safely held</p>}
              </div>
              <div className="flex sm:flex-col gap-2 shrink-0">
                {l.renter && (
                  <>
                    <button
                      onClick={() => setExpandedId(l.id)}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 whitespace-nowrap flex items-center gap-1.5"
                      style={{ color: C.cream, border: C.border, background: "transparent" }}
                    >
                      <IconCamera />
                      Upload photos
                    </button>
                    {l.status === "Return due today" && (
                      <button
                        onClick={() => setExpandedId(l.id)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 whitespace-nowrap flex items-center gap-1.5"
                        style={{ background: C.primary, color: C.onAccent }}
                      >
                        <IconCheck />
                        Confirm return
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-5 rounded-2xl flex items-center gap-4" style={{ background: `rgba(38,34,32,0.03)`, border: `1px solid ${C.border}` }}>
        <svg className="w-5 h-5 shrink-0" style={{ color: C.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <div>
          <p className="font-medium text-sm" style={{ color: C.cream }}>Have something else to rent out?</p>
          <p className="text-xs" style={{ color: C.faint }}>Create a new listing in minutes.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [detailListing, setDetailListing] = useState<Listing>(LISTINGS[0]);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress] = useState("7xKp...m3Rq");
  const [solBalance] = useState(12.4);
  const [showWalletModal, setShowWalletModal] = useState(false);

  return (
    <div className="min-h-full flex flex-col" style={{ background: C.bg }}>
      <Nav
        screen={screen}
        setScreen={setScreen}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        solBalance={solBalance}
        onConnectClick={() => setShowWalletModal(true)}
        isHero={screen === "home"}
      />
      <main className="flex-1">
        {screen === "home"     && <HomeScreen setScreen={setScreen} setDetailListing={setDetailListing} />}
        {screen === "list"     && <ListScreen setScreen={setScreen} />}
        {screen === "detail"   && <DetailScreen listing={detailListing} setScreen={setScreen} />}
        {screen === "rentals"  && <RentalsScreen />}
        {screen === "listings" && <ListingsScreen />}
      </main>
      {showWalletModal && (
        <WalletModal onClose={() => setShowWalletModal(false)} onConnect={() => { setWalletConnected(true); setShowWalletModal(false); }} />
      )}
    </div>
  );
}
