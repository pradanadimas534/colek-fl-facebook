# DESIGN.md: Colek Balik 1-Klik (Facebook Poke Back Utility)

## Identity & Purpose
- **Product**: Colek Balik 1-Klik (Chrome Extension Manifest V3 + Sandbox Simulator).
- **Core Job**: Memindai halaman `/pokes` Facebook dan membalas semua tombol "Colek Balik" / "Poke Back" yang tampil di layar sekaligus hanya dengan satu kali klik tombol aksi utama.
- **Audience**: Pengguna Facebook Indonesia & global yang ingin membalas semua colekan teman secara instan tanpa klik satu per satu.
- **Visual Language**: Utilitarian-Clean. Tegas, fungsional, kontras tinggi, tanpa dekorasi tak berguna, fokus pada satu tombol aksi utama (`Balas Semua Colekan Sekarang`) dan catatan log status real-time.
- **Dial**: `ENERGY 2 / RHYTHM 2 / MOTION 1`

## Decisions & One-Line Reasons (R-31)
- **Palette (2 Core Neutrals + 1 Deliberate Accent)**:
  - Light Mode Surface `#FAFAFA` / Card `#FFFFFF` / Border `#6B7280` (3:1 non-text contrast) / Primary Text `#111827` / Secondary Text `#374151` — memberikan keterbacaan tinggi menyerupai panel utilitas sistem.
  - Dark Mode Surface `#0F172A` / Card `#1E293B` / Border `#94A3B8` (3:1 non-text contrast) / Primary Text `#F8FAFC` / Secondary Text `#CBD5E1` — menjaga kenyamanan mata di malam hari dengan kontras WCAG AA penuh.
  - Accent Color `#0F56B3` (Light mode primary button with `#FFFFFF` text, ratio > 7:1) & `#3B82F6` (Dark mode accent with `#0F172A` text) — satu warna aksen biru tegas khusus untuk tombol aksi utama 1-klik agar menjadi satu-satunya focal point di layar.
- **Typography**:
  - System UI Sans (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`) untuk teks antarmuka — menyatu langsung dengan tampilan native Facebook dan cepat dimuat tanpa request font eksternal.
  - System Monospace (`'Consolas', 'SFMono-Regular', monospace`) khusus untuk angka counter dan baris timestamp log — memudahkan pemindaian angka dan urutan waktu eksekusi.
- **Layout & Hierarchy**:
  - Popup Extension disusun satu kolom vertikal (Header + Kartu Aksi Utama & Counter + Panel Log Status) — mengarahkan mata langsung ke tombol "Balas Semua Colekan Sekarang".
  - Floating Widget di halaman Facebook ditempatkan di pojok kanan bawah (`bottom: 20px; right: 20px`) dengan tombol pemicu 1-klik berukuran minimum `44px` tinggi — mudah dijangkau tanpa menutupi daftar colekan di tengah layar.
  - Sandbox Simulator menggunakan layout 2-bagian yang responsif (Panel Kontrol Skenario Uji di atas/samping + Daftar Kartu Colekan Facebook + Floating Widget) — memudahkan pengujian Empty State, Loading State, Error State, dan Normal State secara langsung.
- **Spacing & Border Radius**:
  - Skala jarak `4px / 8px / 12px / 16px / 24px` dan radius tegas (`6px` untuk tombol/input, `8px` untuk kontainer kartu) — membedakan fungsi elemen kontrol dan kontainer tanpa membuat semuanya berbentuk kapsul/pill (R-11).
- **Motion (Dial MOTION 1)**:
  - Hanya perubahan state hover/focus/active instan (`120ms ease`) tanpa animasi berulang atau pulse tanpa henti — menjaga responsivitas alat utilitas tetap cepat.
- **Identity Motif**:
  - Penanda status berbentuk lencana kotak tegas (`border-radius: 4px`, border `1.5px solid`) dengan label teks eksplisit (`[SIAP]`, `[MEMPROSES]`, `[SELESAI]`, `[KOSONG]`, `[GALAT]`) sehingga status tidak pernah hanya mengandalkan warna.
