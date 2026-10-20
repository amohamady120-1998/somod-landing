# ربط Manus بالمنصة

Manus ممتاز في البحث عن ليدز. الهدف إن نتايجه تدخل المنصة مباشرة بدل ما تتنسخ بإيدك.

## الطريقة 1 — ملف CSV (الأسهل)
اطلب من Manus يسلّم النتيجة كملف CSV بالأعمدة دي، وبعدين استورده من **توليد الليدز ← استيراد**.

**شركات:**
```
company,website,industry,city,description
```
**أشخاص (صناع قرار):**
```
name,title,company,website,email,phone,linkedin
```
**منافسات وفرص:**
```
title,entity,reference,deadline,url,activity
```
المنصة بتتعرّف على الأعمدة تلقائي، بالعربي أو الإنجليزي، وبتتجاهل المكرر.

## الطريقة 2 — إرسال مباشر (Manus يبعت بنفسه)
محتاج:
- `INGEST_KEY` يكون متحط في GitHub Secrets.
- تشغّل **Setup Supabase** بعد ما تحطه.

رابط الاستقبال بتلاقيه في **الربط والإعدادات**، وشكله كده:
```
https://<project>.supabase.co/functions/v1/ingest
```

### Prompt جاهز تديه لـ Manus
> ابحث عن 20 شركة سعودية في قطاع [البنوك / الطاقة / …] حجمها أكبر من 500 موظف، وعندها مؤشرات على مشاريع تقنية أو تحول رقمي أو أمن سيبراني خلال آخر 6 شهور. لكل شركة هات: الاسم، الموقع، القطاع، المدينة، وسطر عن سبب الترشيح. وهات لكل شركة لحد شخصين من صناع القرار (CIO / مدير التقنية / مدير المشتريات) بالاسم والمنصب ورابط LinkedIn.
>
> لما تخلص، ابعت النتايج بطلبين HTTP POST على الرابط:
> `https://<project>.supabase.co/functions/v1/ingest`
> مع الهيدرز: `Content-Type: application/json` و `x-ingest-key: <المفتاح>`
>
> الطلب الأول (الشركات):
> `{"type":"accounts","source":"manus","items":[{"name":"...","website":"...","sector":"...","city":"...","notes":"سبب الترشيح"}]}`
>
> الطلب التاني (الأشخاص):
> `{"type":"contacts","source":"manus","items":[{"name":"...","title":"...","company":"...","website":"...","linkedin":"..."}]}`
>
> وابعتلي ردّ السيرفر في الآخر.

الأنواع المتاحة: `accounts`، `contacts`، `leads` (منافسات: title, entity, ref, deadline, url)، `news` (title, link, summary, entity).

> 🔒 المفتاح ده بيسمح لأي حد معاه إنه يضيف بيانات، لكن مايقدرش يقرا أو يمسح حاجة. لو اتسرّب، غيّر `INGEST_KEY` وشغّل Setup Supabase.

## طريقة 3 — من الإيميل
لو Manus بيبعتلك النتايج على الإيميل، حوّلها لفولدر **Leads**، والمنصة هتقراها الصبح.
