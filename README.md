# 🦜 Muhabbet Kuşu: Sonsuz Gökyüzü

Telefonda oynanan, sonsuz, yükseltmeli bir uçuş-atış oyunu. Muhabbet kuşunu parmağınla sürükle, düşmanları tohumla vur, güçlen ve ne kadar uzağa gidebileceğini gör.

## 📲 Telefonda oyna

### Seçenek 1: APK (Android uygulaması)
1. Telefondan **[Son Sürüm sayfasını](https://github.com/R0YC0LD/MuhabbetForNecla/releases/latest)** aç.
2. **`MuhabbetKusu.apk`** dosyasına dokunup indir ve aç.
3. Telefon sorarsa **"Bilinmeyen kaynaklardan yüklemeye izin ver"** seçeneğini aç, **Yükle**'ye bas. (Android 8.0+)

APK her push'ta GitHub Actions tarafından otomatik derlenir ve bu sayfaya konur. Repodaki [`MuhabbetKusu.apk`](MuhabbetKusu.apk) dosyası da aynı oyundur.

### Seçenek 2: Tarayıcıdan (kurulum gerekmez, iPhone'da da çalışır)
1. **https://r0yc0ld.github.io/MuhabbetForNecla/** adresini telefonda aç.
2. İstersen tarayıcı menüsünden **"Ana ekrana ekle"** de: oyun tam ekran bir uygulama gibi açılır ve internetsiz de çalışır.

## 🎮 Oynanış

- **Ekranın herhangi bir yerinde parmağını sürükle**, kuş parmağının hareketini takip eder. Kuş otomatik ateş eder.
- Düşmanlardan düşen **mavi kristalleri** topla, seviye atla ve her seviyede **3 güçten birini** seç.
- **Altınlar kalıcıdır**: ana menüden kuşunu kalıcı olarak güçlendir.
- Her **5 dalgada bir boss** gelir. Oyun **sonsuzdur**, düşmanlar her dalgada güçlenir.

## ✨ Özellikler

| | |
|---|---|
| **17 oyun içi güç** | Çoklu atış, yan atış, delici, güdümlü, patlayan ve buz tohumu, dönen tüyler, kritik, kalkan, yenilenme, can çalma... |
| **11 kalıcı yükseltme** | Hasar, atış hızı, can, kritik, mıknatıs, altın, tecrübe, başlangıç kalkanı, kart yenileme, erken güç, Anka Tüyü (yeniden doğma) |
| **8 düşman türü** | Zıplayan, zikzak, nişancı, hücumcu, bölünen, tank, elit düşmanlar ve 6 farklı boss |
| **5 güçlendirme** | Can, kalkan, çılgın atış, bomba, süper mıknatıs |
| **9 kostüm** | Yeşil, mavi, lutino, beyaz, mor, pembe, gece, gökkuşağı ve gizli Altın Kanat |
| **16 başarım** | Altın ödüllü başarımlar ve istatistikler |
| **Günlük ödül** | 7 günlük artan ödül serisi |
| **Gün döngüsü** | Gökyüzü dalgalar ilerledikçe gündüz → gün batımı → gece → şafak olarak değişir |
| **Ayarlar** | Ses/müzik seviyesi, titreşim, kontrol modu (Sürükle / Takip), hassasiyet, parmak mesafesi, grafik kalitesi, ekran sarsıntısı, hasar sayıları, FPS, duraklatma seçenekleri |

Tüm grafikler ve sesler kodla üretilir, internet gerekmez. İlerleme telefonda otomatik kaydedilir.

## 🛠 Geliştirme

- Oyun: `app/src/main/assets/` (HTML5 Canvas + JavaScript). Tarayıcıda `index.html` açılarak da test edilebilir.
- Android kabuğu: `app/src/main/java/com/necla/muhabbet/MainActivity.java` (tam ekran WebView, titreşim ve geri tuşu köprüsü).
- Derleme: `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`
- Her push'ta GitHub Actions APK'yı derler ve "son-surum" adlı GitHub Release'e koyar.
- Web sürümü GitHub Pages ile ana daldan yayınlanır (kök `index.html` oyuna yönlendirir).
