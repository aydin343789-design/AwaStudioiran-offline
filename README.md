# آوای ایران آزاد

استودیوی حرفه‌ای تبدیل متن فارسی به صدا برای Android، با دو موتور آنلاین و آفلاین.

## امکانات نسخه 1.2.0
- Online AI TTS با ElevenLabs
- Offline TTS با موتور فارسی نصب‌شده روی Android
- پروفایل‌های نریشن، خبر، پادکست، تبلیغاتی، سینمایی و داستانی
- کتابخانه صداهای ElevenLabs و جست‌وجوی صدا
- کارگردان هوشمند صدا و برچسب‌های احساسی Eleven v3
- نرمال‌سازی فارسی و فرهنگ تلفظ محلی
- ورود فایل TXT
- نمایش تعداد کاراکتر، واژه و زمان تقریبی
- پخش، ذخیره، اشتراک‌گذاری و تاریخچه خروجی‌ها
- بررسی اتصال آنلاین و آمادگی موتور آفلاین
- تم تاریک/روشن و رابط RTL موبایل‌محور
- آیکون رسمی برنامه
- GitHub Actions برای ساخت APK

## راه‌اندازی
```bash
npm install
npx cap sync android
```

برای ساخت APK در GitHub Actions، workflow موجود در `.github/workflows/build-apk.yml` را اجرا کنید. Workflow از Gradle 8.10 و Java 17 استفاده می‌کند.

## API Key
کلید ElevenLabs را داخل GitHub commit نکنید. در برنامه از بخش تنظیمات وارد کنید. برای توزیع عمومی APK، استفاده از gateway سمت سرور امن‌تر است.

## حالت آفلاین
حالت آفلاین کاملاً وابسته به موتور TTS نصب‌شده روی گوشی است. اگر صدای فارسی روی دستگاه وجود نداشته باشد، برنامه آن را به‌صورت شفاف اعلام می‌کند.

## ساختار
- `www/` رابط کاربری و منطق JavaScript
- `android/` لایه native و Capacitor
- `www/data/pronunciation-fa.json` داده تلفظ فارسی
- `.github/workflows/build-apk.yml` ساخت خودکار APK

## Secure Online Gateway — v1.3

نسخه 1.3 کلید ElevenLabs را از APK حذف کرده است. حالت آنلاین اکنون به Gateway سمت سرور درخواست می‌دهد و Gateway با Secret `ELEVENLABS_API_KEY` با ElevenLabs ارتباط می‌گیرد. فایل Worker در `server/worker.js` قرار دارد.

برای راه‌اندازی، Secret را فقط در محیط Worker تنظیم کنید و URL آن را در تنظیمات برنامه وارد کنید. هرگز کلید را در GitHub، `www/`، `app.js` یا فایل APK قرار ندهید.
