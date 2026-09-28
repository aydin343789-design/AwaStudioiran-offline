# Gateway متن‌باز آوای ایران آزاد

Cloudflare Worker در این پوشه درخواست‌های برنامه را به API خودمیزبان Piper می‌فرستد. کلید API شما برای ارتباط Worker با backend است؛ در APK قرار نمی‌گیرد و هیچ API پولیِ TTS استفاده نمی‌شود.

## راه‌اندازی

1. سرویس Docker در `server/piper-api` را روی ماشینی که از اینترنت قابل‌دسترسی است اجرا کنید.
2. در Cloudflare یک Worker بسازید و محتوای `worker.js` را منتشر کنید.
3. در Worker Settings → Variables and Secrets دو مقدار تعریف کنید:
   - `PIPER_API_URL`: نشانی HTTPS سرویس Piper، بدون `/` پایانی.
   - `PIPER_API_TOKEN`: همان توکن امنی که هنگام اجرای API در `PIPER_API_TOKEN` گذاشتید.
4. در اپ، نشانی Worker را در Settings وارد و «آزمون API آنلاین» را بزنید.

## Endpointها

- `GET /health` — بررسی سلامت backend
- `GET /v1/voices` — فهرست صدای Piper پیکربندی‌شده
- `POST /v1/tts` — متن و سرعت را می‌گیرد و فایل WAV برمی‌گرداند

Worker طول متن را به ۱۲٬۰۰۰ کاراکتر محدود می‌کند و صدای مجاز را روی `fa_IR-amir-medium` نگه می‌دارد. برای انتشار عمومی، احراز هویت کاربر و rate limit per-user را هم اضافه کنید؛ محدودیتِ Worker به‌تنهایی از استفادهٔ عمومی یا سوءاستفاده جلوگیری نمی‌کند.

## اجرا

راهنمای Docker، token، مدل و وابستگی‌های متن‌باز در [`piper-api/README.md`](piper-api/README.md) است. هزینهٔ کتابخانه/درخواست وجود ندارد، اما آنلاین‌بودن دائمی مستلزم ماشینی است که API روی آن اجرا شود.
