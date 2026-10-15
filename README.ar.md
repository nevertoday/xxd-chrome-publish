# xxd-chrome-publish

<div dir="rtl">

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **العربية**

**أوصل إضافة Chrome إلى سوق Chrome الإلكتروني وحافظ على تحديثها — من النشر الأول إلى كل إصدار، من سطر الأوامر.**

| النشر لأول مرة | صور المتجر | كل تحديث |
|---|---|---|
| يقرأ شيفرتك ويجهّز نصوص صفحة المتجر وتبريرات الأذونات وإجابات الخصوصية بترتيب لوحة التحكم، مجلد لكل لغة | لقطات شاشة وأيقونات وصور ترويجية بألوان واجهة الإضافة نفسها وخطوطها، فتبدو منتجًا واحدًا | بناء وحزم ورفع وإرسال للمراجعة، ويخبرك **قبل الرفع** إن كان المتجر سيرفضها |

استخدمها كأمر، أو كمهارة في Claude Code / Codex: «انشر هذه الإضافة»، «جهّز صفحة المتجر لها».
ترخيص MIT. بلا تبعيات npm؛ عند أول التقاط للشاشة أو صنع للصور يُثبَّت playwright-core في ذاكرة تخزين محلية.

## ما الذي توفّره عليك

| قبل | معها |
|---|---|
| ينجح الرفع ويفشل الإرسال: *does not meet the requirements* | الفحص المسبق يسمّي الإذن الجديد الذي يحتاج تبريرًا، وسطر الشيفرة الذي يستخدمه |
| تبريرات أذونات وإفصاحات بيانات مكتوبة بالتخمين ولا تطابق الشيفرة | تُقرأ الشيفرة أولًا: ما يفعله كل إذن، وأي الخوادم تُستدعى، وهل توجد شيفرة عن بُعد |
| حزمة بـ 13 لغة واثنتا عشرة صفحة متجر فارغة | مجلد مواد لكل لغة يُؤكَّد قبل النشر؛ ويمكن إضافة لغات لا تملكها الحزمة بعد (اليابانية، الكورية، العربية…) |
| لوحة جانبية عرضها 400 بكسل ممدودة على لقطة الشاشة كلها | تُلتقط اللوحات الجانبية والنوافذ المنبثقة داخل نافذة متصفح، ببيانات تجريبية، دون شبكة ودون حسابات حقيقية |
| صور ترويجية بألوان لا تستخدمها الإضافة | تُقرأ الألوان والخطوط والزوايا من صفحات الإضافة كما تُعرض فعلًا |
| ملفات تُحمَّل لاحقًا وتراخيص مكتبات خارجية غائبة عن ملف ZIP | تُكتشف وتُحزم معها |
| رقم إصدار موجود أصلًا في المتجر | يُحسب الإصدار التالي من الشيفرة والمتجر معًا |
| لا تعرف أي الإضافات فيها تغييرات لم تُنشر | جدول واحد للجميع |

## شاهد النتيجة

صُنع لإضافة «Cover Collage»:

</div>

![صورة ترويجية: الألوان والخط والزوايا القائمة من واجهة الإضافة؛ والمحور هو الغلاف الذي تصنعه](assets/examples/promo-marquee.en.png)

![لقطة متجر: اللوحة الجانبية داخل نافذة متصفح بجوار الموقع الذي تعمل عليه](assets/examples/screenshot-sidepanel.png)

<div dir="rtl">

فحص قبل النشر:

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
  => NEEDS DASHBOARD
```

<div dir="rtl">

ظهر إذن موقع جديد. افتح الرابط، واكتب جملة عن سبب الحاجة إليه، واحفظ، ثم انشر — بدل أن تكتشف ذلك بعد الرفع والإرسال والرفض.

</div>

![مسار النشر: أي خطوة قبل الرفع يمكنها إيقافه](assets/diagrams/flow.en.svg)

<div dir="rtl">

## البدء السريع

**1. التثبيت** (Node 18 أو أحدث)

</div>

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # كأمر
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # كمهارة Claude (Codex: ~/.codex/skills)
```

<div dir="rtl">

**2. دون حساب في المتجر** — داخل مجلد الإضافة:

</div>

```bash
xxd-chrome-publish listing .        # تجهيز مواد النشر الأول
xxd-chrome-publish style .          # قراءة ألوان الواجهة وخطوطها وزواياها
xxd-chrome-publish pack . --patch   # رفع رقم الإصدار وبناء ملف ZIP جاهز للرفع
```

<div dir="rtl">

**3. للنشر، اربط حساب المتجر** (مرة واحدة — [خطوة بخطوة](references/setup.md))

</div>

```bash
xxd-chrome-publish setup --publisher-id <ID from the dashboard URL> --service-account <service account email>
xxd-chrome-publish bind --extension-id <extension ID or store URL>   # once per extension folder
xxd-chrome-publish                                                   # publish
```

<div dir="rtl">

## ثلاث حالات وأوامرها

### النشر لأول مرة

</div>

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # read the code, pack, scaffold in dashboard order
xxd-chrome-publish privacy-page .                 # publish the privacy policy, fill its URL in
xxd-chrome-publish listing . --check              # unfinished items, Markdown, long summary, missing files
```

<div dir="rtl">

المجلد الذي يُنشأ (على سطح المكتب، لا داخل الشيفرة):

</div>

```
<extension folder>-store-assets/
├── fill-text.md                 paste top to bottom, in dashboard order
├── upload-files/                icon, screenshots, promo tiles, privacy page, ZIP
├── language-versions/<locale>/  per listing language: paste text, full notes, privacy policy
└── working/listing-facts.md     the evidence: where each permission is used, which servers are called
```

<div dir="rtl">

بعد ذلك أنشئ العنصر في لوحة التحكم، وارفع ملف ZIP، والصق النصوص. حين يحصل على معرّف، نفّذ `bind`؛ ويتحقق الإصدار الأول أولًا من قوائم السماح لتسجيل الدخول، وحساب اختبار للمراجعين، وصفحة دعم عامة.

### صور المتجر

| تريد أن | اكتب |
|---|---|
| تلتقط صور المتجر وفق سيناريو (`--locale ja` لليابانية) | `xxd-chrome-publish shots . --scenario shots.json` |
| تقرأ أسلوب الواجهة للأيقونات والصور | `xxd-chrome-publish style .` |
| تصنع أيقونات 16/32/48/128 وأيقونة المتجر وورقة مراجعة | `xxd-chrome-publish icon . --svg icon.svg` |
| تُخرج صورة ترويجية وتفحص النص الفائض أو المقصوص أو المنكسر | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| تفحص المقاسات والشفافية مع معاينة لصفحة المتجر | `xxd-chrome-publish images .` |

كل ما يُرفع بصيغة PNG ‏24 بت بلا شفافية، كما يطلب المتجر. تحتاج لقطات الشاشة إلى Google Chrome، ويُثبَّت playwright-core في `~/.cache` عند أول استخدام.

### كل تحديث

| تريد أن | اكتب |
|---|---|
| ترى ما سيحدث دون تغيير شيء | `xxd-chrome-publish preflight` |
| تنشر التحديث | `xxd-chrome-publish` |
| تعيد الإرسال بعد إكمال لوحة التحكم | `xxd-chrome-publish submit` |
| تتابع المراجعة | `xxd-chrome-publish status` |
| ترى أي الإضافات في مجلد ما فيها تغييرات لم تُنشر | `xxd-chrome-publish scan ~/code` |
| تتحقق من إعداد الحساب | `xxd-chrome-publish doctor` |

## داخل مساعد ذكاء اصطناعي

بعد تثبيتها كمهارة، قل ببساطة:

- «انشر إضافة flomo»، «أي الإضافات يمكنني نشرها؟»
- «جهّز صفحة المتجر لهذه الإضافة، بالعربية واليابانية والكورية أيضًا»
- «اصنع خمس لقطات للمتجر وصورًا ترويجية بأسلوب الواجهة»

ينتهي كل نشر بتقرير بصيغة ثابتة يفصل ثلاث حقائق: حُفظت لوحة التحكم، رُفعت الحزمة، أُرسلت للمراجعة. ولا يسمّي الإرسال «منشورًا» أبدًا — فالنشر يأتي بعد موافقة Google.

## ما لا تستطيعه

</div>

![ما تفعله الأداة، وما لا يستطيعه أحد غيرك](assets/diagrams/roles.en.svg)

<div dir="rtl">

لا توفّر Google واجهة برمجية لهذه الأمور، فتتم في لوحة تحكم مطوّري Chrome: إنشاء العنصر، ولصق نصوص المتجر وإجابات الخصوصية، ورفع الصور. تجهّز الأداة النصوص والصور بالترتيب مع روابط لوحة التحكم. ولا يسمح Chrome للإضافات بالتحكم في صفحات المتجر، لذا لا يستطيع مساعد ذكاء اصطناعي داخل إضافة ملأها؛ أما ذكاء اصطناعي يتحكم في الحاسوب مباشرة فيمكنه الملء والحفظ ثم مراجعة كل حقل.

## التفاصيل

</div>

<details>
<summary><b>تسجيل الدخول: اختر واحدة</b></summary>

<div dir="rtl">

| الطريقة | مناسبة لـ | تحتاج إلى |
|---|---|---|
| gcloud + حساب خدمة | جهازك، دون ملف مفاتيح | Google Cloud SDK وحساب خدمة |
| رمز تحديث OAuth | التكامل المستمر (مثل GitHub Actions) | `CWS_CLIENT_ID` و`CWS_CLIENT_SECRET` و`CWS_REFRESH_TOKEN` |

⚠️ يوضع حساب الخدمة في حقل **service account** بصفحة Account في لوحة التحكم، **وليس** في “Trusted tester accounts” المجاور؛ فذلك لا يمنح وصولًا إلى الواجهة البرمجية ويُبقيك مع أخطاء 403.

خطوة بخطوة: [references/setup.md](references/setup.md)

</div>

</details>

<details>
<summary><b>كل خيارات النشر</b></summary>

<div dir="rtl">

| الخيار | يفعل |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (الافتراضي 1.2.4) |
| `--set-version 1.5.0` | استخدام هذا الإصدار بالضبط |
| `--no-bump` | إبقاء إصدار manifest.json |
| `--skip-build` / `--skip-checks` | عدم تشغيل سكربت البناء / الفحص |
| `--dashboard-ready` | لوحة التحكم جاهزة؛ تابِع |
| `--cancel-pending` | سحب الإصدار قيد المراجعة وإرسال هذا |
| `--upload-only` | الرفع دون إرسال |
| `--staged` | بعد الموافقة، الانتظار حتى تنشره بنفسك |
| `--zip file.zip` | رفع ملف ZIP هذا بدل بناء واحد |
| `--commit` | إيداع تغيير الإصدار في git بعد الانتهاء |
| `--json` | مخرجات قابلة للقراءة آليًا |
| `--lang zh` / `--lang en` | لغة التقرير الختامي واسم المتجر في اسم ملف ZIP؛ الافتراضي لغة النظام |

رموز الخروج: `0` تم · `1` خطأ · `2` إصدار آخر قيد المراجعة · `3` مهام لوحة التحكم أولًا.
خيارات أوامر الصور: `xxd-chrome-publish --help`.

</div>

</details>

<details>
<summary><b>إعدادات كل إضافة</b> (<code>.chrome-publish.json</code>)</summary>

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

| الحقل | المعنى |
|---|---|
| `extensionId` | الأحرف الـ 32 في رابط المتجر |
| `build` | أمر البناء، أو `false`؛ الافتراضي سكربت `build` في package.json |
| `check` | أمر الاختبار، أو `false`؛ الافتراضي سكربت `check` في package.json |
| `packageDir` | المجلد المراد حزمه، مثل `dist` لمخرجات البناء |
| `include` / `exclude` | ملفات تُحزم دائمًا / لا تُحزم أبدًا |

</div>

</details>

<details>
<summary><b>الكتابة للمراجعين، وحل الأخطاء</b></summary>

<div dir="rtl">

- كل حقل في النشر الأول: [references/first-listing.md](references/first-listing.md)
- سيناريوهات لقطات الشاشة: [references/screenshots.md](references/screenshots.md) · الأيقونات والصور الترويجية: [references/store-images.md](references/store-images.md)
- تبريرات أذونات يقبلها المراجعون: [references/dashboard.md](references/dashboard.md)
- الأخطاء وحلولها: [references/troubleshooting.md](references/troubleshooting.md)

</div>

</details>

<details>
<summary><b>التحديث والتطوير</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # update (the skill link and the command both point here)
npm test                                # tests run against a local fake store; nothing is published
npm run diagrams                        # regenerate the diagrams after editing build.mjs
```

</details>

<div dir="rtl">

ترخيص MIT

</div>
