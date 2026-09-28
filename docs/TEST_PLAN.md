# طرح تست

## Build

- `npm ci` و `npm run build` موفق شوند.
- `npx cap sync android` خروجی `www/build` را بدون خطا کپی کند.
- `./gradlew assembleDebug` APK بسازد.
- مدل `.onnx` یا WASM بزرگ در Git یا APK قرار نگرفته باشد؛ دانلود مدل در اولین اجرای local انجام شود.

## API آنلاین

- `/health` از Worker وضعیت backend را گزارش کند.
- `/v1/voices` صدای `fa_IR-amir-medium` را برگرداند.
- `/v1/tts` برای متن فارسی WAV غیرخالی بسازد.
- متن خالی، متن بیش از ۱۲٬۰۰۰ کاراکتر، token نامعتبر و voice ناشناخته رد شوند.
- تست API زمانی معتبر است که `PIPER_API_URL` و `PIPER_API_TOKEN` به یک سرویس آماده اشاره کنند.

## Local WebAssembly

- قبل از دانلود، رابط نیاز اینترنت و حجم تقریبی را توضیح دهد.
- پیشرفت دریافت runtime و مدل نمایش داده شود.
- پس از آماده‌سازی، مدل در OPFS و runtime در IndexedDB بماند.
- تولید دوم بدون اینترنت انجام شود و WAV در cache برنامه ذخیره/پخش شود.
- حالت عدم پشتیبانی WebAssembly یا OPFS باید پیام قابل‌فهم بدهد.

## Android device QA

- تست روی حداقل یک Android 10+ با WebView به‌روز.
- اندازه و مصرف حافظه روی دستگاه میان‌رده بررسی شود؛ inference محلی ممکن است بسته به CPU چند ثانیه یا بیشتر طول بکشد.
- فایل WAV ذخیره و از طریق share Android باز شود.
