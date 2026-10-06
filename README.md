# 🦜 Muhabbet Kuşu: Sonsuz Gökyüzü

Telefonda oynanan, sonsuz, yükseltmeli bir uçuş-atış oyunu. Muhabbet kuşunu parmağınla sürükle, düşmanları tohumla vur, güçlen ve ne kadar uzağa gidebileceğini gör.

## 📲 Kurulum

1. Bu repodaki **[`MuhabbetKusu.apk`](MuhabbetKusu.apk)** dosyasını telefona indir.
2. Dosyayı aç. Telefon izin isterse **"Bilinmeyen kaynaklardan yüklemeye izin ver"** seçeneğini aç.
3. **Yükle**'ye bas ve oyna. (Android 8.0 ve üzeri)

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
- Her push'ta GitHub Actions APK'yı derleyip "Artifacts" olarak ekler.
