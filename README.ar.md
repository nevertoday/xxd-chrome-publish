# xxd-chrome-publish

<div dir="rtl">

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **العربية**

انشر تحديثات إضافات Chrome **المنشورة مسبقًا على سوق Chrome الإلكتروني** من سطر الأوامر، أو اطلب ذلك من
Claude Code أو Codex. أمر واحد يبني الإضافة ويفحصها ويحزمها، ثم يقارنها بالنسخة المنشورة، ويرفعها، ويرسلها للمراجعة.

أهم ما يميّزها عن سكربتات الرفع العادية هو **الفحص المسبق (preflight)**: قبل رفع أي شيء، تخبرك بما سيرفضه المتجر.

</div>

```
$ xxd-chrome-publish preflight
Image Crop Tool · ~/code/crop · phdjhhjbapkmagifbejfabimojmjngbe
  store     PUBLISHED 1.0.26
  version   1.0.26 → 1.0.27
  package   27 files · 249 KB
  manifest  vs store: +hosts https://api.example.com/*
  dashboard 1 to-do:
    [required] Justify the new host permissions
    open https://chrome.google.com/webstore/devconsole/…/edit/privacy
  => NEEDS DASHBOARD — fill the [required] items, Save draft, then publish with --dashboard-ready
```

<div dir="rtl">

## لماذا؟

واجهة برمجة سوق Chrome الإلكتروني لا تستطيع إلا رفع الحزمة وإرسالها للمراجعة. أمّا مبرّرات الأذونات، وإفصاحات
استخدام البيانات، ورابط سياسة الخصوصية، ونص صفحة المتجر، فلا يمكن تعديلها **إلا من لوحة تحكم المطوّر**.
كل أدوات سطر الأوامر (ومنها chrome-webstore-upload-cli) تصطدم بهذا الحد، والعرَض المعتاد هو أن ينجح الرفع ثم يفشل
الإرسال برسالة `does not meet the requirements`.

تنزّل هذه الأداة الحزمة المنشورة، وتقارن ملف manifest فيها بملفك المحلي، وتعرض الأذونات والنطاقات الجديدة التي تحتاج
إلى مبرّر، مع أسطر الكود التي تستخدمها، فتكتب المبرّر في دقيقة واحدة. كما تعالج أخطاء التحزيم الشائعة:

- **الملفات المحقونة عند الحاجة**: تُضمَّن الملفات المحمّلة عبر `chrome.scripting.executeScript({ files: [...] })`
  أو عبر خرائط مثل `{ panel: ["build/panel.js"] }`، بينما تُسقطها أدوات الضغط التي تتبع المراجع فقط دون أي تنبيه.
- **البناء القديم**: تُشغَّل سكربتات `build` و`check` الخاصة بالمشروع أولًا، وإذا فشلت لا يُرفع شيء.
- **الملفات المفقودة**: إذا أشار manifest إلى ملف غير موجود، تتوقف الأداة قبل الرفع.
- **تعارض الإصدارات**: يُحسب الإصدار التالي من manifest المحلي ومن المتجر معًا (المنشور وقيد المراجعة)، فلا يُرفض
  الإرسال حتى لو كان المتجر أحدث من نسختك المحلية.
- **مراجعة جارية**: تُكتشف من البداية بدل أن يفشل التنفيذ في منتصفه.

## التثبيت

كمهارة لوكيل ذكي (Claude Code، Codex، …):

</div>

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex: ~/.codex/skills
```

<div dir="rtl">

وضع المستودع خارج مجلد المهارات ثم ربطه برابط رمزي يعني أن `git pull` يحدّث المهارة في مكانها، ويمكنك تعديلها
كأي مشروع آخر. بعد ذلك يكفي أن تقول: «انشر إضافتي» أو «أي إضافاتي فيها تغييرات لم تُنشر بعد؟».

كأداة سطر أوامر (Node 18 أو أحدث، بلا أي اعتماديات):

</div>

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # ينشئ الرابط ~/.local/bin/xxd-chrome-publish
```

<div dir="rtl">

للتحديث لاحقًا: `git -C ~/code/xxd-chrome-publish pull`، فرابط المهارة وأداة سطر الأوامر يشيران كلاهما إلى هذا المستودع.

## الإعداد (مرة واحدة)

</div>

```bash
xxd-chrome-publish setup --publisher-id <المعرّف الموجود في رابط لوحة التحكم>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<project>.iam.gserviceaccount.com
#   أو صدّر CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN (OAuth، مناسب لـ CI)
cd my-extension && xxd-chrome-publish bind --extension-id <معرّف الإضافة أو رابطها في المتجر>
xxd-chrome-publish doctor
```

<div dir="rtl">

الخطوات التفصيلية لطريقتي المصادقة موجودة في [references/setup.md](references/setup.md) (بالإنجليزية).
ضع حساب الخدمة في حقل **service account** في صفحة Account بلوحة التحكم، لا في حقل «Trusted tester accounts»
الموجود في الصفحة نفسها؛ فذلك حقل مختلف لا يمنح أي صلاحية على الواجهة البرمجية، ووضعه هناك يسبب الخطأ 403.

## الاستخدام

</div>

```bash
xxd-chrome-publish preflight        # يعرض ما سيحدث فقط، دون تغيير أي شيء
xxd-chrome-publish                  # النشر: بناء ← فحص ← تحزيم ← مقارنة ← رفع ← إرسال
xxd-chrome-publish submit           # بعد إكمال لوحة التحكم: إرسال المسودة المرفوعة دون رفعها مجددًا
xxd-chrome-publish scan ~/code      # كل الإضافات: الإصدار المحلي مقابل المتجر، حالة المراجعة، الالتزامات غير المنشورة
xxd-chrome-publish status | pack | cancel | rollout 50
```

<div dir="rtl">

خيارات مفيدة: `--minor` و`--major` و`--set-version X` و`--no-bump` و`--skip-build` و`--skip-checks`
و`--dashboard-ready` و`--cancel-pending` و`--upload-only` و`--staged` و`--zip PATH` و`--commit` و`--json`.
رموز الخروج: `0` نجاح · `1` خطأ · `2` يوجد إصدار قيد المراجعة · `3` يلزم إكمال لوحة التحكم أولًا.

إعدادات كل إضافة تُكتب في `.chrome-publish.json`:

</div>

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "build": "npm run build",
  "check": false,
  "packageDir": "dist",
  "include": ["assets/models/**"],
  "exclude": ["fixtures/**"]
}
```

<div dir="rtl">

## ما لا تفعله

النشر لأول مرة، وتعديل نص صفحة المتجر أو لقطات الشاشة، وتعبئة تبويب الخصوصية. لا توفّر Google واجهة برمجية لهذه
الأمور، كما يمنع Chrome أي إضافة متصفح (بما فيها وكلاء التصفح بالذكاء الاصطناعي) من التحكم في صفحات المتجر.
بدلًا من ذلك تخبرك الأداة بالضبط بما يجب إدخاله؛ وتجد أمثلة على كتابة مبرّرات الأذونات في
[references/dashboard.md](references/dashboard.md).

## التطوير

</div>

```bash
npm test   # اختبارات الوحدات + اختبارات شاملة على متجر وهمي محلي
```

<div dir="rtl">

مرخّصة بموجب MIT.

</div>
