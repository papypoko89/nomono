# CLAUDE.md — Nomono Member App

> Konteks utama untuk Claude Code. Baca file ini dulu sebelum mulai kerja.

---

## 📌 Project Overview

Aplikasi **member** untuk **Nomono Padel Club** (4 court padel di Jakarta). Bagian dari sistem loyalty & membership Nomono yang terdiri dari 2 app terpisah:

- **Member app** — repo: `papypoko89/nomono` (👈 ini repo aktif)
- **Staff app** — repo: `papypoko89/nomono-staff`, live di `nomono-staff.vercel.app`

Owner: **Nix** (generalist, non-coder). Bahasa komunikasi: **Indonesia**, penjelasan singkat & langsung ke intinya.

Tools eksternal yang jalan paralel (di luar scope app ini):
- **AYO** — booking court
- **Majoo** — POS / back office

App Nomono fokus murni di **membership & loyalty**.

---

## 🛠️ Tech Stack

- **Framework:** Create React App (react-scripts 5) + React 18
- **Backend:** Supabase (`@supabase/supabase-js` 2.45)
- **Styling:** Inline styles (object style di JSX), bukan Tailwind
- **Font:** DM Mono (Google Fonts)
- **Deploy:** Vercel

> ⚠️ **Catatan:** Member app pakai **CRA + JS** sementara staff app pakai **Vite + TS + Tailwind**. Mereka beda stack. Kalau mau sync style guide, perlu effort migrasi.

### Brand colors
```
#003820  — primary (deep green)
#C39A4B  — accent (gold)
#E0DBBC  — cream
#231F20  — dark text
#F5F2E8  — background utama
#FAF8F2  — background alt
```

---

## 📁 Project Structure

```
nomono/
├── src/
│   └── App.js               # Single-file app, semua screen di sini
├── public/
└── package.json
```

Struktur sengaja flat & simpel. Semua screen (Splash, Onboarding, Login, Register, Home, QR, Rewards, History, Profile) ada di `App.js`.

### Screens
| Screen | Fungsi |
|---|---|
| `splash` | Animated splash screen |
| `onboarding` | Welcome, ke login/register |
| `login` | Email + password (Supabase Auth) |
| `register` | Sign up + create member record |
| `home` | Dashboard: tier, EXP progress, member code, promo |
| `qr` | Dynamic QR code (refresh tiap 60 detik) |
| `rewards` | Katalog reward, filter kategori, redeem |
| `history` | Log transaksi EXP/Koin |
| `profile` | Tier roadmap, info akun, logout |

Bottom nav: `home` / `qr` / `rewards` / `history` / `profile`.

---

## 🧠 Core Concept

### Dual currency system
Setiap transaksi dapat **dua mata uang sekaligus** dengan rasio 1:1 per Rp 10.000:
- **EXP** — lifetime, drives tier progression (tidak pernah berkurang)
- **Koin** — bisa di-redeem jadi reward

### Tier progression (4 tier)
1. **Rookie** — start
2. **Rally** — 500 EXP
3. **Smash** — 1.500 EXP
4. **Ace** — 4.000 EXP

### Member journey
1. Sign up → `register_member` RPC create row di `members` + link ke `auth.users`
2. Tap "My QR" → `generate_qr_token` RPC → QR token 60 detik
3. Tunjukkan QR ke staff → staff scan di staff app → EXP/Koin masuk
4. Buka "Rewards" → tap reward → `redeem_reward` RPC → Koin dipotong, voucher code di-generate

---

## 🗄️ Supabase

- **Project name:** nomono
- **Project ID:** `sysamlqxpdzgoanccjjt`
- **URL:** `https://sysamlqxpdzgoanccjjt.supabase.co`

### Tables yang dipakai member app
- `members` — data member, `total_exp`, `coin_balance`, `member_code`, `auth_id` (FK ke `auth.users`)
- `reward_catalog` — list reward yang aktif
- `transactions` — riwayat EXP/Koin (read-only dari sisi member)
- `tier_settings` — config tier (untuk progress bar di Home)

### RPC functions yang dipakai
```js
supabase.rpc("register_member", { p_auth_id, p_full_name, p_email, p_phone, p_date_of_birth })
supabase.rpc("generate_qr_token", { p_member_id })   // → { token }
supabase.rpc("redeem_reward", { p_member_id, p_reward_id })   // → { voucher_code }
```

### Auth
**Pakai Supabase Auth bawaan** (beda dari staff app yang manual):
- `supabase.auth.signUp({ email, password })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.onAuthStateChange()` → load member by `auth_id`

### RLS — ⚠️ HATI-HATI
- RLS di Supabase pernah bikin silent error
- Kalau `loadMember` gagal, ada retry logic 1 detik
- Kalau query members fail, biasanya RLS-nya yang salah

### Env variables
```
REACT_APP_SUPABASE_URL=https://sysamlqxpdzgoanccjjt.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<JWT anon key>
```
> Karena pakai CRA, prefix env-nya `REACT_APP_` (bukan `VITE_` seperti staff app).

---

## 🚀 Development

### Setup
```bash
pnpm install   # atau npm install
# bikin .env, isi REACT_APP_SUPABASE_URL & REACT_APP_SUPABASE_ANON_KEY
pnpm start     # local dev di :3000
```

### Scripts
```bash
pnpm start     # dev server
pnpm build     # production build → folder build/
```

### Deploy
Push ke main di `papypoko89/nomono` → Vercel auto-deploy.

---

## ⚠️ Known Issues & Gotchas

1. **CRA legacy** — `react-scripts` udah deprecated. Suatu saat perlu migrasi ke Vite biar konsisten dengan staff app, tapi sekarang masih jalan.
2. **Single file architecture** — semua di `App.js`. Kalau mau tambah feature besar, pertimbangkan split jadi `pages/` dan `components/`.
3. **`coin_balance` di DB, `koin` di staff app** — ada inkonsistensi naming. Member app ikut DB → pakai `coin_balance`. Staff app pakai `koin_balance` di types-nya.
4. **QR refresh interval** — 60 detik, kalau di-tweak harus konsisten dengan validasi di RPC `generate_qr_token` server-side.
5. **`member_code`** — auto-generated by trigger di Supabase, jangan generate manual.

---

## 🎯 Current State & Priorities

### ✅ Done
- Splash, Onboarding, Login, Register
- Home dashboard (tier + EXP progress + member code)
- Dynamic QR (auto refresh 60 detik)
- Rewards catalog + redeem flow (sisi member)
- Transaction history
- Profile + tier roadmap

### 🔜 Next: Voucher confirmation flow
Setelah member redeem reward & dapat voucher code:
1. Voucher status: `pending` di DB
2. Member tunjukkan voucher ke staff (display QR voucher / kode)
3. Staff scan/input di staff app → confirm
4. Voucher status: `redeemed`

Bagian member-nya: pastikan voucher yang udah di-redeem **tampil jelas** di app (mungkin tab "Voucher Saya" baru), bisa di-tap untuk dapat QR voucher.

---

## 💬 Communication Notes

Owner (Nix) adalah generalist, bukan coder. Saat menjelaskan:
- **Singkat & langsung ke inti**
- Hindari jargon coding kalau bisa
- Kalau perlu pakai istilah teknis, kasih analogi sederhana
- Kalau prompt-nya kurang jelas, **tanya pertanyaan dasar dulu** sebelum mulai

Bahasa: **Indonesia** by default.
