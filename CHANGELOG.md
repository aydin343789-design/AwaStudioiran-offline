# Changelog

## 1.5.0
- بازطراحی کامل رابط موبایل با پالت سرمه‌ای و طلایی، کنتراست روشن و لوگوی اپ در هدر.
- افزودن کارت‌های آواتار زن/مرد/کودک، منوی تنظیمات و تاریخچه، ورودی حداکثر ۳۰۰۰ نویسه و پلیر خروجی.
- افزودن presetهای عادی، رسمی، خبری، شاد و صمیمی که ریتم و pitch را به‌صورت محدود تنظیم می‌کنند.
- تبدیل WAV مدل Piper به MP3 به‌صورت محلی، پیش‌نمایش پیش از ذخیره و مسیر جداگانهٔ دانلود/موسیقی در Android.
- مدل فعلی فقط گویندهٔ مردانهٔ Amir را دارد؛ آواتار زن/کودک تا تأمین مدل مناسب غیرفعال است و presetها کنترل احساس واقعی نیستند.

## 1.4.0
- جایگزینی سرویس تجاری ElevenLabs با Piper متن‌باز در مسیر online.
- افزودن API خودمیزبان Piper Python/FastAPI همراه Docker و توکن backend.
- افزودن TTS محلی Piper WebAssembly؛ runtime و مدل فقط در اولین آماده‌سازی دانلود و ذخیره می‌شوند.
- حذف وابستگی عملی به Android system TTS؛ پلاگین native فقط برای ذخیره و اشتراک فایل باقی می‌ماند.
- افزودن build با Vite و به‌روزرسانی workflow برای build وب، Capacitor و APK.
- مستندسازی هزینهٔ میزبانی، محدودیت مدل/صدا و اعلان‌های مجوز.

## 1.3.0
- حذف API Key از رابط کاربر و APK.
- اضافه شدن Gateway امن Cloudflare Worker.
- انتقال تولید آنلاین و Voice Library به Gateway.
- اضافه شدن saveBase64Audio برای ذخیره خروجی Gateway در کش Android.
- اضافه شدن تنظیم URL Gateway در برنامه.
- اضافه شدن مستندات امنیتی و راه‌اندازی سرور.

## 1.2.0
- Added professional presets: narration, news, podcast, advertising, cinematic and storytelling.
- Added ElevenLabs voice library with search and one-tap voice selection.
- Added smart director suggestions and Persian direction-to-audio-tag mapping for Eleven v3.
- Added TXT import, word count and duration estimate.
- Added offline Persian TTS readiness check.
- Added online connection test.
- Added lightweight waveform visualization.
- Increased text capacity to 20,000 characters.
- Moved online network work off the Android UI thread.
- Improved GitHub Actions Gradle setup with Gradle 8.10.
- Updated app version to 1.2.0.

## 1.1.0
- Professional UI and branding.
- Online ElevenLabs TTS.
- Offline Android TTS.
- Save/share/history.
- Persian pronunciation preprocessing.
- Android app icon.
