# Architecture

## UI
HTML/CSS/JavaScript خالص، RTL و mobile-first.

## Online
JavaScript از طریق Capacitor به `PersianVoicePlugin` متصل می‌شود. لایه native درخواست HTTPS به ElevenLabs را در یک thread جداگانه انجام می‌دهد تا UI مسدود نشود. فایل MP3 در cache برنامه ساخته می‌شود و سپس برای پخش، ذخیره یا اشتراک‌گذاری استفاده می‌شود.

## Offline
`TextToSpeech.synthesizeToFile` با locale `fa-IR` استفاده می‌شود. قبل از تولید، برنامه می‌تواند وضعیت پشتیبانی فارسی را بررسی کند.

## Voice Library
کتابخانه صدا از endpoint رسمی `/v1/voices` دریافت و در رابط برنامه فیلتر می‌شود. API Key فقط از ورودی محلی برنامه خوانده می‌شود.

## Persian processing
نرمال‌سازی حروف عربی/فارسی، اعداد، فاصله‌ها و تلفظ‌های منتخب در `pronunciation-fa.json`.

## Build
GitHub Actions با Node 22، Java 17 و Gradle 8.10 پروژه را sync و `assembleDebug` می‌کند.
