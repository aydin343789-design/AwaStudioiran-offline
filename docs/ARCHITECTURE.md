# معماری

## رابط کاربری و بسته‌بندی

رابط RTL در `www/` است و Vite آن را در `www/build/` bundle می‌کند؛ Capacitor همین خروجی را در Android WebView نمایش می‌دهد. WebAssembly و مدل ONNX در زمان build به کد native تبدیل نمی‌شوند.

## محلی/آفلاین

`www/piper-engine.js` از `@mintplex-labs/piper-tts-web` و `onnxruntime-web` استفاده می‌کند. در راه‌اندازی اول فایل‌های WASM از CDN و مدل Piper فارسی از مخزن Hugging Face دریافت می‌شوند. WASM در IndexedDB و مدل/پیکربندی در OPFS ذخیره می‌شوند. پس از آماده‌سازی، استنتاج صدا روی دستگاه انجام می‌شود.

## آنلاین

اپ WAV را از `server/worker.js` می‌گیرد. Worker با token سروری به FastAPI در `server/piper-api/app.py` وصل می‌شود. Piper Python مدل را یک بار در startup بار می‌کند و درخواست‌ها را با CPU تولید می‌کند. هیچ token یا کلید سرویس‌دهنده‌ای در APK نیست.

## پردازش فارسی

نرمال‌سازی حروف عربی/فارسی، اعداد و نشانه‌گذاری پیش از تولید اعمال می‌شود. تلفظ‌های سفارشی در `www/data/pronunciation-fa.json` بار می‌شوند.

## محدودیت‌های فنی

- صدای پیش‌فرض `fa_IR-amir-medium` است؛ یک گوینده با کیفیت medium.
- اولین بارِ حالت محلی به اتصال اینترنت و حدود ۹۰ مگابایت فضای خالی نیاز دارد.
- آنلاین به سرور API در دسترس نیاز دارد و Piper کنترل احساسی/clone voice ارائه نمی‌دهد.
- runtime پایتون Piper در سرویس آنلاین GPL-3.0 است؛ بستهٔ Android از آن binary استفاده نمی‌کند.
