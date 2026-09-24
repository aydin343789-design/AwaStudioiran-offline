# Gateway امن آوای ایران آزاد

این Gateway کلید ElevenLabs را فقط روی سرور نگه می‌دارد. APK هیچ API Key ندارد و کاربر فقط به این Gateway درخواست می‌فرستد.

## Cloudflare Worker

1. در Cloudflare یک Worker بسازید.
2. فایل `worker.js` را قرار دهید.
3. در Worker Settings → Variables یک Secret با نام `ELEVENLABS_API_KEY` بسازید.
4. مقدار Secret همان API Key حساب ElevenLabs شماست؛ آن را در GitHub یا APK قرار ندهید.
5. آدرس Worker را در برنامه، بخش تنظیمات، وارد کنید.

Endpointها:
- `GET /health`
- `GET /v1/voices`
- `POST /v1/tts`

`POST /v1/tts` فقط پارامترهای تولید صدا را از کاربر می‌گیرد و خودش API Key را به ElevenLabs اضافه می‌کند.

## محدودیت‌های امنیتی

این نسخه کلید را از کلاینت خارج می‌کند و محدودیت‌های طول متن، مدل و پارامترها را روی Gateway اعمال می‌کند. برای انتشار عمومی بزرگ، مرحله بعد باید احراز هویت کاربر، سهمیه per-user و rate limit پایدار با KV/Durable Objects اضافه شود تا Gateway عمومی قابل سوءاستفاده نباشد.
