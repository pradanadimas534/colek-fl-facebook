# Catatan Kode, Review, dan Panduan Penggunaan: Colek Balik 1-Klik Facebook

Dokumen ini mencatat seluruh file yang ditulis, alasan keputusan desain, hasil review kode, analisis perbaikan error, serta cara memasang ekstensi di Google Chrome.

## 1. Catatan File yang Ditulis
1. [`DESIGN.md`](file:///c:/Program%20Codding/colek-fl-facebook/DESIGN.md)
   - Menyimpan arah gaya visual **Utilitarian-Clean** dengan dial `ENERGY 2 / RHYTHM 2 / MOTION 1`, palet warna Light & Dark yang lolos uji kontras WCAG AA, serta alasan satu baris untuk setiap keputusan visual.
2. [`manifest.json`](file:///c:/Program%20Codding/colek-fl-facebook/manifest.json)
   - Konfigurasi Chrome Extension Manifest V3 dengan izin `activeTab`, `scripting`, dan `storage`, serta injeksi otomatis pada `*://*.facebook.com/pokes*` dan server lokal (`localhost` / `127.0.0.1`).
3. [`content.js`](file:///c:/Program%20Codding/colek-fl-facebook/content.js)
   - Mesin utama pemindai DOM dan eksekutor 1-klik (`executeOneClickPokeAll`).
   - Memindai elemen `div[role="button"]`, `span[role="button"]`, `a[role="button"]`, dan `button` yang memiliki teks atau `aria-label` `"Colek Balik"`, `"Poke Back"`, `"Membalas Colekan"`, atau `"Balas Colek"`.
   - Menyediakan Floating Panel langsung di halaman Facebook lengkap dengan status `[SIAP]`, `[MEMPROSES]`, `[SELESAI]`, `[KOSONG]`, `[GALAT]`, penghitung sesi, log real-time, tombol lipat/buka, dan tombol ganti tema Terang/Gelap.
4. [`content.css`](file:///c:/Program%20Codding/colek-fl-facebook/content.css)
   - Styling terisolasi untuk Floating Panel (`#cbf-floating-widget`) dengan ukuran tombol minimum `44x44px`, indikator `:focus-visible` `3px solid`, dan dukungan tema Terang & Gelap.
5. [`popup.html`](file:///c:/Program%20Codding/colek-fl-facebook/popup.html), [`popup.css`](file:///c:/Program%20Codding/colek-fl-facebook/popup.css), [`popup.js`](file:///c:/Program%20Codding/colek-fl-facebook/popup.js)
   - Antarmuka popup toolbar ekstensi Chrome yang terhubung ke tab aktif melalui `chrome.tabs.sendMessage` untuk memicu 1-klik colek balik atau membuka `https://www.facebook.com/pokes`.
6. [`sandbox-facebook-pokes.html`](file:///c:/Program%20Codding/colek-fl-facebook/sandbox-facebook-pokes.html)
   - Halaman simulator interaktif yang meniru struktur DOM halaman `/pokes` Facebook untuk menguji skenario 5 colekan standar (Bahasa Indonesia & Inggris), kondisi kosong (`Empty State`), tambah teman kustom, dan kondisi gagal klik (`Error State`).

## 2. Catatan Review Kode & Analisis Error
- **Temuan 1 (Kontras Warna Biru Default)**: Saat menguji rasio warna dengan `contrast-check.py`, warna biru `#1877F2` dengan teks putih menghasilkan rasio `4.23:1` (gagal standar teks normal `4.5:1`). Warna aksen utama diperbaiki menjadi `#0F56B3` pada mode terang (`6.99:1` terhadap `#FFFFFF`) dan `#60A5FA` pada mode gelap (`7.02:1` terhadap `#0F172A`).
- **Temuan 2 (Deduplikasi Elemen Nested di DOM Facebook)**: Pada DOM React Facebook, tombol `div[role="button"]` sering membungkus `span` yang juga berisi teks `"Colek Balik"`. Pada `findPokeBackButtons()` di [`content.js`](file:///c:/Program%20Codding/colek-fl-facebook/content.js#L68-L100), digunakan `el.closest('div[role="button"], a[role="button"], button')` beserta `Set` agar satu tombol tidak pernah diklik dua kali.
- **Temuan 3 (Tanda Titik Ganda pada Pesan Error)**: Saat pengujian klik otomatis pada skenario `Error State`, pesan error yang sudah diakhiri tanda titik menghasilkan `..` (`menolak interaksi klik.. Klik Pindai Ulang`). Kode pada [`content.js`](file:///c:/Program%20Codding/colek-fl-facebook/content.js#L204-L211) telah diperbaiki dengan `.replace(/\.+$/, '')` sehingga pesan tampil rapi dengan satu tanda titik.

## 3. Cara Memasang Aplikasi Android (`.APK`) di HP
File aplikasi Android sudah di-build dan siap dipasang langsung di HP Android kamu:
- **File APK Siap Pasang**: [`Colek-Balik-1-Klik-Facebook.apk`](file:///c:/Program%20Codding/colek-fl-facebook/Colek-Balik-1-Klik-Facebook.apk)
- **Kode Sumber Android**: [`MainActivity.java`](file:///c:/Program%20Codding/colek-fl-facebook/android-app/app/src/main/java/com/colekbalik/facebook/MainActivity.java) & [`AndroidManifest.xml`](file:///c:/Program%20Codding/colek-fl-facebook/android-app/app/src/main/AndroidManifest.xml)
- **Halaman Simulator Login & Deteksi Akun Mobile**: [`mobile-apk-preview.html`](file:///c:/Program%20Codding/colek-fl-facebook/mobile-apk-preview.html)

### Alur Pemakaian di HP (`.APK`):
1. Kirim atau unduh file **`Colek-Balik-1-Klik-Facebook.apk`** ke HP Android kamu lalu instal.
2. Saat aplikasi dibuka, halaman resmi **Login Facebook (`m.facebook.com/pokes`)** langsung tampil di dalam aplikasi dengan penyimpanan sesi otomatis (`CookieManager`).
3. Login menggunakan akun Facebook kamu:
   - Status di bar atas aplikasi otomatis berubah dari `[SILAKAN LOGIN]` menjadi **`[AKUN TERHUBUNG]`**.
   - Begitu halaman `/pokes` terbuka, mesin **Auto-Balas (`content.js` & `content.css`)** langsung diinjeksikan otomatis ke akun tersebut.
   - Setiap ada tombol **"Colek balik" / "Poke Back"** di akunmu (termasuk >100 colekan atau teman yang mencolek berulang kali), sistem otomatis mendeteksi dan langsung mencolek balik!
4. Di bar atas aplikasi juga tersedia tombol **`Simulator`** jika kamu ingin menguji simulasi login akun & deteksi colekan tanpa koneksi ke Facebook asli.

## 4. Cara Memasang Ekstensi di Google Chrome (Desktop)
1. Buka Google Chrome dan kunjungi `chrome://extensions/`.
2. Aktifkan sakelar **Developer mode** (Mode pengembang) di pojok kanan atas.
3. Klik tombol **Load unpacked** (Muat yang belum dikemas).
4. Pilih folder proyek ini: `c:\Program Codding\colek-fl-facebook`.
5. Buka `https://www.facebook.com/pokes` (atau buka [`sandbox-facebook-pokes.html`](file:///c:/Program%20Codding/colek-fl-facebook/sandbox-facebook-pokes.html) untuk simulasi lokal), lalu tekan tombol **Balas Semua Colekan Sekarang** sekali saja.
