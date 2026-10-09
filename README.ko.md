# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**명령 하나로 Chrome 확장 프로그램 업데이트를 배포하세요.**
빌드, 압축, 업로드, 심사 제출까지 자동입니다. 업로드하기 전에 스토어가 거부할지 먼저 알려 줍니다.

명령어로 써도 되고, Claude Code / Codex 스킬로 써도 됩니다. "확장 프로그램 배포해 줘"라고 말하기만 하면 됩니다.

> 이미 등록된 확장 프로그램용입니다. 처음 등록은 Chrome 대시보드에서 하세요.

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## 무엇이 해결되나

![The dashboard step moves to before the upload](assets/diagrams/before-after.en.svg)

| 예전 | 이제 |
|---|---|
| 업로드는 됐는데 제출에서 *"does not meet the requirements"* | 어떤 권한에 대시보드 설명이 필요한지, 코드 몇 번째 줄에서 쓰는지 먼저 알려 줌 |
| 나중에 불러오는 파일이 zip에서 빠져서 기능이 고장 남 | 자동으로 찾아서 함께 압축 |
| 오래된 빌드를 실수로 업로드 | 빌드와 테스트를 먼저 실행하고, 실패하면 업로드하지 않음 |
| 버전 번호가 스토어와 겹쳐서 거부됨 | 코드와 스토어를 모두 보고 다음 버전을 정함 |
| 어떤 확장 프로그램에 배포 안 한 변경이 있는지 잊어버림 | 표 하나로 전부 확인 |

## 시작하기

**1. 설치**

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Claude 스킬로 (Codex는 ~/.codex/skills)
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # 명령어로
```

**2. 스토어 계정 연결** (한 번만 · [자세한 방법](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <대시보드 URL의 ID> --service-account <서비스 계정 이메일>
```

**3. 확장 프로그램 폴더마다 ID 연결** (한 번만)

```bash
cd my-extension
xxd-chrome-publish bind --extension-id <확장 프로그램 ID 또는 스토어 링크>
```

**4. 배포**

```bash
xxd-chrome-publish
```

## 자주 쓰는 명령

| 하고 싶은 일 | 명령 |
|---|---|
| 아무것도 바꾸지 않고 결과만 미리 보기 | `xxd-chrome-publish preflight` |
| 업데이트 배포 | `xxd-chrome-publish` |
| 대시보드를 고친 뒤 다시 제출 | `xxd-chrome-publish submit` |
| 심사 상태 확인 | `xxd-chrome-publish status` |
| 배포 안 한 변경이 있는 확장 프로그램 찾기 | `xxd-chrome-publish scan ~/code` |
| 설정이 맞는지 확인 | `xxd-chrome-publish doctor` |

Claude Code / Codex에서는 말만 하세요: *"flomo 확장 프로그램 배포해 줘"*, *"배포할 수 있는 확장 프로그램 뭐 있어?"*

## 검사 결과 예시

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

이번 검사에서는 새 사이트 접근 권한이 발견됐습니다. 링크를 열고 왜 필요한지 한 문장 쓰고 저장한 다음 배포하면 됩니다.

## 할 수 없는 것

![What the tool does, and what only you can do](assets/diagrams/roles.en.svg)

아래 항목은 Google이 API를 제공하지 않아서 Chrome 대시보드에서 해야 합니다.

- 처음 등록
- 스토어 설명과 스크린샷
- 개인정보 탭: 권한 설명, 데이터 사용, 개인정보처리방침 링크

무엇을 어디에 입력하면 되는지는 도구가 정확히 알려 줍니다. 브라우저 AI 에이전트도 대신 입력할 수 없습니다. Chrome이 확장 프로그램의 스토어 페이지 조작을 막기 때문입니다.

## 자세히 (클릭해서 열기)

<details>
<summary><b>로그인 방법: 둘 중 하나</b></summary>

| 방법 | 적합한 곳 | 필요한 것 |
|---|---|---|
| gcloud + 서비스 계정 | 내 컴퓨터. 비밀 키 파일 없음 | Google Cloud SDK, 서비스 계정 |
| OAuth 리프레시 토큰 | CI (GitHub Actions 등) | 환경 변수 `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ 서비스 계정은 대시보드 Account 페이지의 **service account** 칸에 넣어야 합니다. "Trusted tester accounts"가 **아닙니다**. 그 칸에는 API 권한이 없어서 403 오류가 납니다.

전체 절차: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>전체 옵션</b></summary>

| 옵션 | 하는 일 |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (기본은 1.2.4) |
| `--set-version 1.5.0` | 이 버전을 그대로 사용 |
| `--no-bump` | manifest.json의 버전을 바꾸지 않음 |
| `--skip-build` / `--skip-checks` | 빌드 / 테스트를 실행하지 않음 |
| `--dashboard-ready` | 대시보드 입력 완료, 계속 진행 |
| `--cancel-pending` | 심사 중인 버전을 취소하고 이 버전을 제출 |
| `--upload-only` | 업로드만 하고 제출하지 않음 |
| `--staged` | 승인 후 바로 공개하지 않고 직접 공개할 때까지 대기 |
| `--zip file.zip` | zip을 만들지 않고 이 파일을 업로드 |
| `--commit` | 배포 후 새 버전 번호를 git에 커밋 |
| `--json` | 프로그램이 읽기 쉬운 JSON으로 출력 |

종료 코드: `0` 완료 · `1` 오류 · `2` 다른 버전이 심사 중 · `3` 대시보드 입력이 먼저 필요

</details>

<details>
<summary><b>확장 프로그램별 설정</b> (<code>.chrome-publish.json</code>)</summary>

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

| 항목 | 의미 |
|---|---|
| `extensionId` | 스토어 링크에 있는 32자 ID |
| `build` | 빌드 명령 또는 `false`. 기본값은 package.json의 `build` 스크립트 |
| `check` | 테스트 명령 또는 `false`. 기본값은 package.json의 `check` 스크립트 |
| `packageDir` | 압축할 폴더. 빌드 결과가 `dist` 등에 생길 때 지정 |
| `include` / `exclude` | 항상 넣을 / 절대 넣지 않을 파일 |

</details>

<details>
<summary><b>업데이트와 개발</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # 업데이트 (스킬 링크와 명령 모두 여기를 가리킴)
npm test                                 # 테스트 실행 (로컬 가짜 스토어를 써서 실제로 배포되지 않음)
npm run diagrams                         # 다이어그램 다시 만들기 (build.mjs 문구 수정 후)
```

심사를 잘 통과하는 권한 설명 쓰는 법: [references/dashboard.md](references/dashboard.md) ·
오류와 해결 방법: [references/troubleshooting.md](references/troubleshooting.md)

</details>

MIT 라이선스
