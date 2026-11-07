# Wasit: design system

Untuk FE dan siapa pun yang mendesain layar. Semua nilai di sini sudah dipakai di prototipe dan terbukti bekerja di layar
HP 390 × 844, mode terang dan gelap. Salin nilai persis. Kalau perlu nilai baru, tambahkan sebagai token, jangan hardcode.

**Metafora produk: pertandingan.** Papan skor, kartu kuning dan merah, peluit, dan tiket. Agen Wasit adalah wasit yang
netral: tegas soal aturan, ramah dalam bahasa.

---

## 1. Prinsip

1. **Mobile-first, satu kolom.** Lebar maksimal 480 px. Di desktop, aplikasi melayang di tengah seperti perangkat.
   Satu-satunya pengecualian adalah mode presentasi (dua panel, ≥ 1.100 px).
2. **Angka adalah pahlawan.** Total sebanding tampil besar dengan `tabular-nums`. Setiap angka bisa ditelusuri ke asalnya.
3. **Status selalu berwarna + berikon + bertulisan.** Jangan pernah hanya warna.
4. **Proses terlihat, tapi tidak bising.** Ruang Negosiasi menampilkan langkah penting secara default, dan semua langkah
   hanya satu ketukan lagi.
5. **Jujur di UI.** Simulasi ditulis "simulasi", asumsi diberi [A], dan mesin yang menjawab (model/aturan) selalu diberi label.
6. **Ketuk, bukan ketik.** Pertanyaan dijawab dengan chip; selalu ada "Lainnya" dengan contoh isian.

## 2. Brand

### 2.1 Nama dan makna

*Wasit*: pihak netral yang memegang aturan main dari peluit pertama sampai akhir, dari negosiasi sampai tagihan di lokasi.

### 2.2 Logo (mark)

Tile app (squircle) bergradasi indigo dengan satu goresan putih huruf **w**. Lengan terakhirnya naik lebih tinggi
dan terbaca sebagai **centang**: harga sudah diperiksa dan adil.

```svg
<svg viewBox="0 0 32 32" fill="none">
  <defs>
    <linearGradient id="g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3730A3"/><stop offset="1" stop-color="#6E5CF6"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="url(#g)"/>
  <path d="M8.6 12.6 11.9 21 16 14.4 20.1 21 24.6 9.6" stroke="#fff" stroke-width="3.1"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- Di bawah 24 px, tebal goresan 3,4.
- **Varian tanpa tile** (ruang sempit): path `M4.5 11.5 9 23.5 16 13 23 23.5 28.5 6.5`, goresan gradasi, tebal 4,6.
- Ukuran yang dipakai: 24 (header onboarding), 30 (header aplikasi), 50 (orb beranda), 64 (animasi peluit).
- **Jangan:** menambah elemen di dalam tile, memutar, atau menaruhnya di atas latar indigo tanpa kotak putih/gelap.

### 2.3 Wordmark

- `wasit` huruf kecil, Plus Jakarta Sans **800**, tracking **−0,045 em**, line-height 1, warna ink.
- **Titik huruf i berwarna coral `#F2785C`.** Ini peluit, tanda Wasit sedang bekerja, dan satu-satunya tempat coral
  dipakai sebagai warna brand.
- Implementasi: `was` + `ı` (i tanpa titik) dengan titik bulat coral diameter 0,21 em di atasnya + `t`.

### 2.4 Kalimat

- Pitch: *"Clear quotes. No surprise extras."*
- Penutup: *"Find your best deal, from the first quote to the agreed bill."*

## 3. Warna

### 3.1 Token dasar

| Token | Terang | Gelap | Pakai untuk |
|---|---|---|---|
| `--ink` | `#16224A` | `#E8EAF6` | Teks utama, wordmark |
| `--ink-soft` | `#2A3A6B` | `#C5C9E4` | Teks sekunder tebal, gelembung pesan Wasit |
| `--muted` | `#787F88` | `#9AA1AD` | Teks pendukung |
| `--muted-2` | `#A4A9B0` | `#7C8390` | Eyebrow, ikon pasif |
| `--muted-3` | `#C3C7CD` | `#5B6270` | Placeholder halus |
| `--line` | `#E7E8EC` | `#2A3048` | Border |
| `--line-2` | `#EEF0F2` | `#222839` | Track, latar segmented |
| `--paper` | `#F8F9FA` | `#121522` | Latar drawer |
| `--surface` | `#FFFFFF` | `#1A1E2E` | Kartu, input, tombol sekunder |
| `--subtle` | `#F5F6F8` | `#20253A` | Latar kotak di dalam kartu |
| `--canvas` | `#F3F3F4` | `#0D1019` | Latar body |
| `--header-bg` | `#FAFBFBDF` | `#121522D9` | Header (dengan blur 14 px) |

### 3.2 Brand

| Token | Terang | Gelap |
|---|---|---|
| `--brand` | `#4338CA` | `#8B84FF` |
| `--brand-hi` | `#5B50E0` | `#A29DFF` |
| `--brand-lo` | `#3730A3` | `#C4C0FF` |
| `--brand-soft` | `#EEF0FF` | `#262A52` |
| `--brand-tint` | `#E4E6FB` | `#2D3266` |
| `--brand-line` | `#A5A8F0` | `#6E66E8` |
| `--brand-glow` | `#4338CA55` | sama |
| `--brand-gradient` | `linear-gradient(155deg, #5B50E0, #4338CA 60%, #3730A3)` | sama |
| `--coral` | `#F2785C` | sama (hanya titik i, aksen akun penyedia, sorotan "menunggu balasanmu") |

### 3.3 Semantik

| Token | Terang | Gelap |
|---|---|---|
| `--success` / `--success-soft` | `#1F7A4D` / `#E3F6EC` | `#1F7A4D` / `#16301F` |
| `--warning` / `--warning-soft` | `#A15C07` / `#FEF3C7` | `#A15C07` / `#3A2C0C` |
| `--danger` / `--danger-soft` | `#B3455A` / `#FFF0F2` | `#B3455A` / `#3A1A20` |

### 3.4 Kartu wasit

| Kartu | Isi | Latar lembut | Tinta | Ikon | Arti |
|---|---|---|---|---|---|
| Hijau | `#1F7A4D` | `#E3F6EC` (gelap `#16301F`) | `#1F7A4D` | Check | Wajar, valid, bersih |
| Kuning | `#F2C94C` | `#FFF7D6` (gelap `#3A3110`) | `#7A5A00` (gelap `#F2D77C`) | TriangleAlert | Perhatian: di atas kisaran, tambahan tidak disebut |
| Merah | `#D64545` | `#FFE9E9` (gelap `#3D1A1A`) | `#9E2A2A` (gelap `#FF9C9C`) | CircleX | Pelanggaran: umpan, di luar kesepakatan |
| Abu-abu | gradasi `#C3C7CD`→`#9AA0A8` | `--line-2` | `--muted` | Eye | Belum bisa dinilai (data belum cukup) |

### 3.5 Faktor prioritas dan kanal

| Token | Nilai | Pakai |
|---|---|---|
| `--f-price` | `#4338CA` | Bobot harga |
| `--f-slot` | `#0891B2` | Bobot jadwal |
| `--f-trust` | `#D97706` | Bobot kepercayaan |
| `--ch-whatsapp` | `#1F8F4E` | Label kanal (simulasi) |
| `--ch-voice` | `#4338CA` | Label kanal (simulasi) |
| `--ch-sim` | `#6B7280` | Chat simulasi |

**Komposisi total sebanding:**

- jasa = `--brand`;
- transport = `#9B8CFF`;
- transport perkiraan = garis-garis `--muted-3`;
- perkiraan tambahan = `#D97706`.

**Avatar penyedia:** gradasi 155° yang dipilih dari hash nama, dengan pasangan warna:
`#5B50E0/#4338CA`, `#0891B2/#0E7490`, `#D97706/#B45309`, `#2A9566/#1F7A4D`, `#BE185D/#9D174D`.

**Avatar akun:** konsumen memakai gradasi brand; penyedia memakai gradasi coral `#F08A6E → #D9603F`.

### 3.6 Mode gelap

- Light secara default. System adalah pilihan eksplisit. Bisa dipaksa terang atau gelap lewat Pengaturan → Tampilan (`data-theme` di `<html>`,
  disimpan per perangkat).
- Semua warna lewat token. Tidak boleh ada `#fff` atau abu-abu terang yang di-hardcode untuk latar.
- Pengecualian yang **tetap terang**: layar "Tunjukkan ke teknisi" (putih, kontras maksimal) dan latar putih QR code.

## 4. Tipografi

- **Font:** Plus Jakarta Sans 400–800 (Google Fonts), cadangan Inter lalu font sistem. Angka uang dan waktu memakai
  `font-variant-numeric: tabular-nums`. Kode kesepakatan memakai `ui-monospace, 'SF Mono', Consolas, monospace`.
- Input berukuran 16 px supaya iOS tidak zoom.

| Peran | Ukuran / tebal / tracking | Contoh |
|---|---|---|
| Rank besar (outline) | 58 / 850 / −0,06em, stroke 2 px brand, isi transparan | "1" di kartu skor |
| Harga utama | 36 / 780 / −0,04em | Rp238.000 |
| Judul onboarding | 28 / 750 / −0,03em | Masuk ke Wasit |
| Judul halaman | 26 / 750 / −0,6px | Penawaran untuk kamu |
| Judul papan skor | 23 / 700 / −0,5px | Agen Wasit sedang menawar |
| Sapaan beranda | 21 / 750, subjudul 14 / 600 muted | Halo, Rani |
| Nama di kartu | 21 / 750 / −0,02em | Dingin Jaya Teknik |
| Judul sheet / bagian | 17–18 / 700 | Setelah booking |
| Isi | 13–14 / 400–500, line-height 1,55–1,7 | |
| Kecil | 11–12 | Catatan, meta |
| Eyebrow | 10 / 700 / tracking 2 px / UPPERCASE / `--muted-2` | WASIT · PAPAN SKOR |
| Label mesin | 9 / 800 / 0,06em / UPPERCASE | MODEL, ATURAN |
| Kode tiket | 26 / tracking 0,08em, mono | 9B910DAD |

## 5. Ruang, bentuk, bayangan

**Ruang:**

- Padding halaman 8 px atas, 20 px samping, 28 px bawah (ditambah `safe-area-inset-bottom`).
- Celah antar-elemen 6 / 8 / 10 / 12 / 14 / 18 / 22.

**Sudut (radius):**

| Elemen | Radius |
|---|---:|
| Kartu penawaran | 28 |
| Sheet (atas) | 26 |
| Panel, kartu daftar, kotak lifecycle | 18–22 |
| CTA | 16 |
| Tombol sekunder | 15 |
| Input | 14 |
| Ikon tombol | 12 |
| Chip | 24 |
| Pill | 999 |
| Kartu wasit mini | 9 |
| Tile logo | 9/32 dari ukuran |

**Bayangan:**

| Token | Nilai |
|---|---|
| `--shadow-card` | `0 14px 34px #1A2A5A16` |
| `--shadow-panel` | `0 20px 48px #1D2A6A0F` |
| `--shadow-cta` | `0 1px 0 #FFFFFF40 inset, 0 14px 30px -6px #3730A355, 0 4px 10px -2px #3730A340` |
| Baris papan skor | `0 6px 18px #16224A08` |
| Mode gelap | card `0 14px 34px #0006`, panel `0 20px 48px #0005` |

**Target sentuh:** minimal 44 px. Di layar sentuh (`pointer: coarse`), semua chip 44 px.

## 6. Gerak

| Token | Nilai | Pakai |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Hampir semua transisi |
| `--ease-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` | Masuk layar, sheet |
| Spring baris / kartu | stiffness 380, damping 32, mass 0,8 | Papan skor mengurut ulang, kartu kembali |

| Animasi | Durasi | Detail |
|---|---|---|
| Masuk layar | 360 ms | Dari opacity 0 dan y +10 |
| Ganti fase app (masuk/onboarding/app) | 460 ms | Scale 0,97 + blur 4 px → normal |
| Sheet naik | 340 ms | Dari y +40 |
| Peluit (setelah kirim permintaan) | 1,2 dtk | Mark membesar 0,85 → 1,12 → 1, tiga cincin menyebar, teks "Peluit dibunyikan · Agen Wasit mulai" |
| Ticker angka | 500 ms | Ease-out kubik dari nilai lama ke baru |
| Baris trace muncul | 220 ms | Dari opacity 0 dan y +8 |
| "Sedang berpikir" | 1,6 dtk loop | Kilau gradasi lewat teks; tiga titik naik-turun 1,1 dtk; cincin denyut di ikon |
| Fase berjalan | 1,4 dtk loop | Batang 40% bergerak di segmen fase aktif |
| Titik live | 1,8 dtk | Denyut bayangan |
| Kilau CTA | 2,4 dtk, sekali, jeda 0,5 dtk | Sapuan cahaya diagonal |
| Stempel TERKUNCI | 360 ms, jeda 200 ms | Dari rotate 8°, scale 1,4 |
| Kartu wasit diangkat | Spring stiffness 300, damping 18 | Dari y +40, rotate −6° ke −2° |
| Toast harga turun | 2,6 dtk tampil | Dari y +12 |
| Geser kartu | Ambang 25% lebar; keluar 1,45× lebar dalam 280 ms; rotasi ±9° pada ±320 px | Stempel TERIMA/LEWATI muncul dari 16–110 px |
| Tekan | Scale 0,975 (CTA), 0,98 (sekunder), 0,95 (ikon) | 160 ms |

**`prefers-reduced-motion`:** semua animasi dan transisi menjadi 0 ms, termasuk kilau, titik, dan denyut. Ticker langsung
ke nilai akhir.

## 7. Ikon

Lucide (`lucide-react`), tebal default, 12–19 px, mengikuti ukuran teks.

| Konsep | Ikon |
|---|---|
| Berpikir | Brain |
| Konteks | Gauge |
| Gerbang lolos / diblokir | ShieldCheck / ShieldX |
| Pesan keluar / masuk / orang | Send / MessageCircle / UserRound |
| Ekstraksi / validasi | ScanText / ListChecks |
| Flag / cadangan / waktu habis | TriangleAlert / Cpu / Timer |
| Tutup / peringkat / kunci | Flag / Scale / Lock |
| RFQ / Job / direktori | GitBranch / FileSearch |
| Ulang | RotateCcw |
| Harga turun | TrendingDown |
| Kalender / bagikan / layar penuh | CalendarPlus / Share2 / Maximize2 |
| Bayar / sengketa / bintang | Wallet / Scale / Star |
| Profil usaha / kotak masuk / pekerjaan | Store / Inbox / Wrench |

## 8. Komponen

Setiap komponen di bawah dipakai ulang di banyak layar. Bangun sekali, pakai di mana-mana.

### 8.1 Dasar

| Komponen | Spesifikasi |
|---|---|
| **CTA** | Lebar penuh, min-height 54, radius 16, `--brand-gradient`, teks putih 15/650, `--shadow-cta`, kilau sekali. Disabled: latar `--line-2`, teks `#A4A9AD`, tanpa bayangan. Busy: spinner 850 ms |
| **Tombol sekunder** | Min-height 52, radius 15, border `--line`, latar `--surface`, teks ink 14/650 |
| **Text link** | Brand 13/600, min-height 44. Varian `muted` |
| **Back link** | Ikon ArrowLeft + teks ink-soft 13/500 |
| **Icon button** | Shared border, radius12 and small shadow; interactive touch target at least44px. |
| **Chip** | Min-height 40 (44 di layar sentuh), radius 24, border; `aria-pressed=true` → latar brand-soft, border brand, teks brand-lo 600. Bisa memuat ikon Check |
| **Pill** | 11/650, radius 999. Varian brand, success, warning, danger. Bisa berisi titik berkedip (status live) |
| **Segmented** | Grid 2 kolom, latar `--line-2`, padding 4, radius 14; tab aktif latar surface + bayangan. Dipakai: Papan skor / Ruang negosiasi, Kartu / Bandingkan |
| **Field** | Label 13/600 + ikon + keterangan kecil (wajib/opsional); input min-height 52, radius 14, 16 px |
| **Price input** | Prefix "Rp" abu-abu + angka besar terformat `id-ID` |
| **Notice** | Radius 14, latar danger-soft, teks danger 12 |
| **Safety line** | 10 px, abu-abu, di tengah, ikon perisai. Contoh: "Penyedia simulasi · tanpa pembayaran" |
| **Eyebrow** | Lihat tipografi, bisa diawali titik live |
| **Toggle (switch)** | Baris dengan judul + keterangan, saklar di kanan, `role=switch` |
| **Sheet** | Fixed bawah, lebar maks 480, radius atas 26, maks tinggi 88dvh, backdrop gelap. Isi: eyebrow + judul + tombol tutup |

### 8.2 Brand dan wasit

| Komponen | Spesifikasi |
|---|---|
| **Mark + Wordmark** | Header mark30 + wordmark21 with public readiness below: AI ready or Wasit ready. Actual engines remain attached to recorded events. |
| **RefCard (kartu mini)** | Inline-flex, 11/650, padding 5/9/5/6, radius 9. Kiri: "kartu" 10×14 px miring −8° berisi ikon 9 px. Warna sesuai 3.4. Maks 2 per baris; sisanya "+N catatan lain di rincian" |
| **Raised card** | 52×72 px, radius 8, bayangan, diangkat dengan spring. Dipakai di putusan cek lokasi |
| **Engine chip** | Compact MODEL or RULES badge identifying the engine that produced the recorded event. |
| **Ticker** | Angka Rupiah yang bergulir 500 ms |
| **Fase** | 4 kolom (Pahami, Hubungi, Negosiasi, Nilai), batang 6 px: selesai = brand, aktif = brand-tint + batang berjalan, berikut = line-2. Label 10/650 |
| **Fair range bar** | Track 8 px; zona wajar gradasi hijau transparan; penanda bulat 16 px border 3 px ink (merah kalau di luar). Kepala: "Kisaran wajar" + "Rp165.000 – Rp320.000". Di bawahnya catatan sumber 10,5 px |
| **Composition bar** | Batang 10 px, segmen dengan celah 2 px; legenda bisa diketuk untuk melihat nilai dan persen |
| **Insight** | "**Wajar** · Rp12.000 di bawah median". Varian: Murah, Wajar, Mahal, "Data harga belum cukup" (abu-abu). Kalau ada kartu merah: "Wajar di atas kertas · lihat kartu merah" |
| **Scenario banner** | Kotak gelap `#1B2240` dengan teks terang: "SC-01 · Judul" + "Yang diharapkan: …" |
| **Story caption** | Latar brand-soft, teks brand-lo 12,5, satu kalimat per fase |

### 8.3 Papan skor dan Ruang Negosiasi

| Komponen | Spesifikasi |
|---|---|
| **Baris papan skor** | Grid `18px 38px 1fr auto`, padding 12, radius 18. Isi: posisi (atau "–"), avatar 38, nama + tag ORANG, baris status ("Agen: {keputusan}"), kartu mini atau chip "turun Rp12.000" (hijau, TrendingDown), lalu di kanan total (Ticker, abu-abu bila belum valid) dan pill status (Agen berpikir · Ronde 2 · Menunggu balasan · Waktu habis · Selesai). Belum membalas: tiga titik. Mengurut ulang dengan spring |
| **Toast harga** | Pill hijau di atas layar: "Sejuk Prima turun Rp16.000", tampil 2,6 dtk, sekaligus diumumkan lewat aria-live |
| **Trace item** | Ikon 24×24 radius 8 di garis waktu kiri. Meta: aktor tebal + "+3,1 dtk" + engine chip + nama penyedia (brand). Isi: judul 13 + detail 11,5 muted. Pesan keluar = gelembung brand-soft; pesan masuk = gelembung surface + border; sudut kiri atas 4 px. Gerbang diblokir dan flag: ikon merah/kuning |
| **Action summary** | A concise verified action, source and outcome with the actual model/rules engine. Expand to inspect cited inputs and gate results; never expose private reasoning. |
| **Pemisah ronde** | "RONDE 1" 10/700 uppercase muted + garis |
| **Chip penyedia** | Ikon kanal + nama depan; "Semua" di depan |
| **Ke langkah terbaru** | Pill gelap mengambang di bawah tengah, muncul saat pengguna menggulir ke atas |
| **Ambil alih** | Panel di cabang: "Penyedia bertanya: 'mereknya apa?' Wasit tidak menebak." → tombol "Ambil alih" → input pesan + "Serahkan kembali ke Agen Wasit" |
| **QR penyedia** | Kotak: QR 132 px (latar putih), "Jadi {nama}", cara pakai, peringatan jalankan mode LAN, tautan "Buka di tab ini" |

### 8.4 Deck dan pilihan

| Komponen | Spesifikasi |
|---|---|
| **Kartu skor (depan)** | Radius 28, di atas tumpukan dua bayangan kartu. Atas: rank outline besar + nama + "★ 4,6 · 210 pekerjaan · data demo" + chip kanal "via WhatsApp · simulasi". Isi: harga 36 + "total sebanding", insight, komposisi, fair range, meta (jam · garansi), maks 2 kartu mini, tombol pill "Rincian & jejak negosiasi →" |
| **Kartu (belakang)** | Bagian dengan ikon kotak 30 px: Rincian total sebanding (baris biaya + total), Cakupan & harga tambahan (chip hijau termasuk, chip "?" untuk tidak disebut), Alasan Wasit (+ "ditulis model / aturan" + keandalan "menjawab 5/6 pertanyaan"), Jejak negosiasi (trace ringkas) |
| **Stempel geser** | "TERIMA" hijau / "LEWATI" merah, border 3 px, 21/800, muncul sesuai jarak geser |
| **Tombol bulat** | Lewati (X), Kembalikan (RotateCcw, kecil), Terima (Check); celah 22 |
| **Preset prioritas** | Baris chip yang bisa digulir: Prioritas kamu · Termurah · Tercepat · Terpercaya |
| **Tabel Bandingkan** | #, Penyedia, Total (termurah hijau tebal), Jadwal, Garansi, Kartu. Baris bisa diketuk untuk membuka kartu |
| **Retry sheet** | Chip budget "Tetap Rp400.000 / +50rb → Rp450.000 / …" dan chip jadwal, lalu CTA "Minta Wasit mencari lagi" |

### 8.5 Agreement and aftercare

| Component | Contract |
|---|---|
| Checkout | `.commerce`, `.cm-product`, `.cm-hero`, `.cm-info`, `.cm-price` and four `.cm-step` stages: Offer, Terms, Acceptance, Active. A selected quote remains a draft until both parties accept the same version. |
| Agreement ticket | Channel band, product header, tilted AGREED stamp, itemized terms, perforation and eight-character code with full digest. Only the active immutable version supplies agreed prices. A pending change stays visibly separate. |
| Ticket tools | Show technician, Calendar and Share. The technician view is a high-contrast full-screen portal with Escape/close, focus restoration and optional wake lock. Sharing excludes private spending limits. Calendar export requires a confirmed ISO slot. |
| On-site check | Photo capture or manual item entry; extracted rows stay editable and require explicit confirmation. Raised green/red/yellow cards identify matches, already-included work or terms requiring review. No result replaces an agreed price automatically. |
| Change proposal | Explicit item scope, quantity, unit, price and explanation. Submit, accept and reject operate on a named version. A change affects the payable amount only after both parties accept it. |
| Lifecycle | `.lifecycle` with five stages: Accepted, Paid, Done, Confirmed, Reviewed. Show held, released, refunded and amount due separately. Payment simulation, disputes and recommendations are visibly labeled. |
| Disputes and reviews | Evidence notes identify their author. Recommendations remain advisory until an accepted resolution. Finished jobs allow one consumer review and one provider reply. |

### 8.6 Account and provider surfaces

| Component | Contract |
|---|---|
| Account chip | Avatar in the topbar opens the existing account popover. Profile, priorities, optional named account and sign out are keyboard accessible. No fabricated account roster or shared demo password. |
| Provider entry | `/provider/:branch#token=...` consumes the invitation fragment into memory and removes it from the address bar. The page has no consumer shell or consumer history. |
| Provider chat | `.page.provider`, `.provider-head`, `.provider-job`, `.p-tabs`, `.thread`, `.bubbles`, `.bubble`, `.composer` and `.send`. Enter sends, Shift+Enter adds a line, composition is respected and retries reuse the same message ID. |
| Provider work | Only its own branch, versions, funds, disputes, reviews and business settings are available. Consumer budgets and other branches' raw messages are excluded. |
| Business and feedback | Existing `.job-card`, `.rev-summary` and `.rev-list` wrappers retain the shared typography, buttons and spacing. Editable service area, consent and price items use the provider API. |

## 9. Routes, shell and interactions

The public entry and onboarding have no app chrome. The consumer app uses `.shell`, a sticky `.shell-header`, `.brand-stack`, `.header-actions` and `.shell-main`. Topbar controls are History, Sun/Moon theme, Settings and Account. Light is the default. Theme switching belongs in the topbar; Settings contains no appearance control.

| Route | Behavior |
|---|---|
| `/welcome` | Always shows the centered public entry: Clear quotes. No surprise extras. Starting returns a saved profile to the app, or opens setup for an unsaved profile. Returning here never resets data or signs out. |
| `/` | First visit shows entry; after entry and profile setup it shows the app composer. `/home` replaces its URL with `/`. |
| `/setup` | Two-step profile and three-factor priorities with total100 and optional locks. The quick demo profile remains available; email registration is optional. |
| `/request` | New request composer within the shared shell. Rotating examples, presets, repeat last request and Enter submission remain available. Missing fields open an inline follow-up sheet. |
| `/account` | Optional named sign-in/registration or account switching. A named account still completes its own profile. |
| `/profile`, `/settings/priorities` | Edit the saved profile or priorities within the shell. `/settings/profile` replaces its URL with `/profile`; `/onboarding` with `/setup`. |
| `/settings` | Profile and area, priorities, account, AI models and demo controls. Theme remains in the topbar. |
| `/settings/models` | Two server-allowed model selectors for request/negotiation and bill images, explicit Save and Restore defaults. Preferences belong to the current actor and apply to new requests and new bill previews; existing requests retain their saved configuration. |
| `/demo` | Scenario and view controls. Back to app and Back to welcome are separate navigation actions. Fullscreen presentation can be entered and exited without resetting profile or route. Reset is a separate explicit action. |
| `/requests/:id` | Live scoreboard and negotiation room; comparison appears after processing or explicit Compare navigation. |
| `/requests/:id/compare` | Offer deck/table with item scope, committed quote total, unknown costs and ranking eligibility. |
| `/deals/:id` | Versioned checkout or active agreement ticket, payment simulation, disputes, reviews and history. |
| `/deals/:id/check` | Editable bill check and explicit change proposal, with a Back to agreement action. Provider updates require an explicit processing action. |
| `/provider/:branch` | Private provider surface; no consumer shell. |

Legacy `/r/:id` and `/deal/:id` aliases replace their URL with canonical request/deal paths. Browser Back and direct links preserve the session and selected resource. Unknown routes offer Back to app and Back to welcome rather than silently discarding a resource.

History uses the existing left drawer markup: `.drawer-backdrop`, `.drawer`, `.drawer-head`, `.drawer-new`, `.drawer-list`, `.history-row`. It reads only the signed-in actor's request summaries; each row opens its request or agreement. Loading, empty and error states remain distinct. The drawer is portaled to the document body so its fixed position remains correct on long pages and animated phases. Escape, backdrop, keyboard focus containment, inert background and focus restoration are required. New request closes the drawer and opens the composer without deleting history.

Phase transitions use opacity0/scale0.97/blur4px to opacity1/scale1/blur0, exiting at opacity0/scale1.02/blur6px; duration460ms with easing[0.22,1,0.36,1]. Reduced-motion users skip the transform/blur transition. Welcome takeover is720ms, launch whistle1250ms and raised verdict cards use the shared spring animation. Header, drawer, account menu, bottom sheets, offer cards, ticket and provider chat retain their shared class structure instead of separate page-specific visual systems.

## 10. Product language and truthful amounts

All product UI, errors, comments and accessibility labels use English; the product name remains Wasit. The centered entry headline is **Clear quotes. No surprise extras.** Use short, concrete sentences and actionable errors.

| Label | Meaning |
|---|---|
| Quoted total | Explicit committed item prices plus transport for the comparable quoted scope. Optional work and estimates are excluded. |
| Agreed total | Total from the active version accepted by both parties. |
| Not quoted | A missing value; never display a fabricated zero. |
| Reference range | Advisory published prices for explicitly comparable item, unit and scope; show insufficient data when evidence is inadequate. |
| Proposed change | Pending terms that do not yet replace the active agreement. |
| Payment simulation | Demonstration ledger actions without an actual external transfer. |
| Held, released, refunded | Separate version-bound ledger amounts. |

Preserve Rupiah formatting (`Rp238.000`), quantities and explicit units; show local schedules in WIB. Public readiness can say AI ready or Wasit ready. Recorded events still identify their actual model/rules engine. An action summary shows verified inputs, gates and results; never expose private chain-of-thought. Missing sources, unavailable photo reading and stale-version conflicts explain a concrete next step.

## 11. Aksesibilitas

- Fokus pindah ke judul layar setiap rute berubah (`h1` dengan `tabindex=-1`).
- `aria-live="polite"` hanya untuk perubahan yang penting: harga turun dan pergantian peringkat #1. Jangan untuk setiap
  langkah trace.
- Kartu memakai warna + ikon + teks. Kontras teks minimal AA, termasuk di mode gelap.
- Semua kontrol bisa dipakai dengan keyboard. Sheet menutup dengan Esc dan backdrop. Switch memakai `role=switch` +
  `aria-checked`. Chip memakai `aria-pressed`. Tab memakai `role=tab` + `aria-selected`.
- Target sentuh 44 px. Input 16 px.
- `prefers-reduced-motion` dihormati (lihat 6).
- Getaran pendek (bila didukung): 20–30 ms saat aksi berhasil, pola panjang saat kartu merah diangkat.

## 12. Tata letak responsif

| Lebar | Perilaku |
|---|---|
| < 480 | Penuh layar |
| ≥ 768 | Kolom 480 di tengah, body bergradasi radial brand-tint, bayangan perangkat `0 30px 80px #1D2A6A1C` |
| ≥ 1.100 + mode presentasi | Papan skor menjadi dua panel (papan 5 : ruang negosiasi 7), lebar maks 1.240, judul 30 |

Header memakai sticky + blur 14 px. Jangan ada scroll horizontal; chip yang banyak dibungkus ke baris berikutnya, atau
digulir dalam barisnya sendiri dengan padding 22 px.
