# Somod Landing Page

صفحة الهبوط الرسمية لمنصة Somod.

## التشغيل محلياً
```bash
npm install
npm start
```

## النشر على Railway
- Root Directory: /
- Start Command: npm start (معرّف في railway.json)

الملفات الثابتة في `public/` فقط هي اللي بتتقدّم للمتصفح.

## صور الشاشات في قسم "المنصة كما يراها فريقك"
الصور في `public/assets/screens/` مولّدة من `tools/screens/screens.html` (نسخة عربية وإنجليزية لكل شاشة).
لتعديلها: عدّل ملف HTML ثم شغّل `node tools/screens/render.js` (يحتاج Playwright وPython مع Pillow).
عند توفر لقطات حقيقية من المنصة، استبدل الملفات بنفس الأسماء والمقاسات (`admin|vendor` ‏1920×1200، `owner|tech` ‏828×1736).
