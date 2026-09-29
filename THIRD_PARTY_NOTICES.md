# Third-party notices

این پروژه به چند جزء با مجوزهای مستقل وابسته است. برای انتشار نسخهٔ تجاری یا بازتوزیع فایل‌ها، متن مجوز و شرایط جاری هر پروژه را دوباره بررسی کنید.

| جزء | کاربرد | مجوز | منبع |
|---|---|---|---|
| `@mintplex-labs/piper-tts-web` | رابط Piper در مرورگر | MIT | [npm](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web) |
| `@diffusionstudio/piper-wasm` | runtime WebAssembly Piper | MIT | [npm](https://www.npmjs.com/package/@diffusionstudio/piper-wasm) |
| `onnxruntime-web` | اجرای مدل ONNX با WebAssembly | MIT | [npm](https://www.npmjs.com/package/onnxruntime-web) · [مستند deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html) |
| `@breezystack/lamejs` 1.2.7 | تبدیل WAV خروجی به MP3 در دستگاه | LGPL-3.0 | [npm](https://www.npmjs.com/package/@breezystack/lamejs) · [مخزن](https://github.com/shijinyu/lamejs) |
| `@soundtouchjs/audio-worklet` و `@soundtouchjs/core` 2.1.1 | تغییر مستقل سرعت و زیر و بمی | MPL-2.0 | [مخزن SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) · [npm](https://www.npmjs.com/package/@soundtouchjs/audio-worklet) |
| Piper Python (`piper-tts`) | API آنلاین اختیاری | GPL-3.0 | [مخزن upstream](https://github.com/OHF-Voice/piper1-gpl) |
| صدای `fa_IR-amir-medium` | وزن مدل فارسی | MIT در model repo | [فایل‌های مدل](https://huggingface.co/rhasspy/piper-voices/tree/main/fa/fa_IR/amir/medium) · [mirror مرورگری](https://huggingface.co/diffusionstudio/piper-voices/tree/main/fa/fa_IR/amir/medium) |
| صدای `fa_IR-mana-medium` | وزن مدل فارسی زنانه | MIT در model repo | [مدل Piper Mana](https://huggingface.co/MahtaFetrat/Mana-Persian-Piper) · [پیکرهٔ اصلی ManaTTS](https://github.com/MahtaFetrat/ManaTTS-Persian-Speech-Dataset) |

مدل صوتی از مجوز runtime جداست. مخزن مدل Mana مجوز MIT را برای وزن‌ها اعلام می‌کند؛ مقاله و مخزن ManaTTS پیکرهٔ اصلی را CC0 1.0 و ضبط تک‌گویندهٔ زن را مستند کرده‌اند. سازندگان بر استفادهٔ اخلاقی و پرهیز از جعل/تقلید هویت تأکید دارند. پیش از عرضهٔ تجاری یا انتشار مدل تغییریافته، model card و مجوزهای جاریِ هم فایل مدل و هم داده را دوباره بررسی کنید و از نسبت‌دادن خروجی مصنوعی به گویندهٔ واقعی خودداری کنید.

در APK وزن ONNX و runtime WASM بسته‌بندی نمی‌شوند؛ حالت محلی آن‌ها را در اجرای اول دریافت می‌کند. backend Python در Android تعبیه نشده و سرویس اختیاری جداگانه‌ای است؛ شخصی که container آن را بازتوزیع می‌کند باید تکالیف GPL-3.0 را رعایت کند.

Encoder MP3 تحت LGPL-3.0 است و به‌صورت کتابخانهٔ JavaScript در bundle قرار می‌گیرد. پیش از توزیع تجاری، متن مجوز همین نسخه را بخوانید و الزامات مربوط به بازتوزیع/جایگزینی کتابخانه را رعایت کنید.
