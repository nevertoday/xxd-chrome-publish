# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Chrome 확장 프로그램을 웹 스토어에 올리고 계속 업데이트하기. 첫 등록부터 매번의 배포까지 명령줄에서.**

| 첫 등록 | 스토어 이미지 | 매번 업데이트 |
|---|---|---|
| 코드를 읽고 스토어 설명, 권한 설명, 개인정보 답변을 대시보드 순서대로 준비. 언어마다 폴더 하나 | 스크린샷, 아이콘, 홍보 이미지를 확장 프로그램 자체 UI의 색과 글꼴로. 하나의 제품처럼 보임 | 빌드, 패키지, 업로드, 심사 제출. **업로드하기 전에** 스토어가 거절할지 알려 줌 |

명령어로 써도 되고, Claude Code / Codex 스킬로 써도 됩니다. "이 확장 프로그램 배포해 줘", "등록 자료 준비해 줘"라고 말하면 됩니다.
MIT 라이선스. npm 의존성이 없습니다. 스크린샷과 이미지를 만들 때만 playwright-core를 로컬 캐시에 자동 설치합니다.

## 덜어 주는 수고

| 예전 | 이제 |
|---|---|
| 업로드는 성공, 제출에서 *does not meet the requirements* | 사전 검사에서 설명이 필요한 새 권한과 그 권한을 쓰는 코드 줄을 알려 줌 |
| 권한 설명과 데이터 공개를 짐작으로 쓰고, 코드와 어긋남 | 먼저 코드를 읽음: 권한별 용도, 연결하는 서버, 원격 코드 여부 |
| 13개 언어 패키지인데 스토어 페이지 12개가 비어 있음 | 언어별 자료 폴더를 만들고 배포 전에 하나씩 확인. 패키지에 아직 없는 언어(일본어, 한국어, 아랍어…)도 추가 가능 |
| 폭 400px 사이드 패널이 화면 가득 늘어난 스크린샷 | 사이드 패널과 팝업은 브라우저 창 안에서 촬영. 데모 데이터, 오프라인, 실제 계정은 건드리지 않음 |
| 확장 프로그램이 쓰지 않는 색의 홍보 이미지 | 색, 글꼴, 모서리를 확장 프로그램 페이지의 실제 렌더링에서 읽어 옴 |
| 나중에 불러오는 파일과 라이브러리 라이선스가 ZIP에서 빠짐 | 찾아서 함께 패키지 |
| 스토어에 이미 있는 버전 번호 | 코드와 스토어를 함께 보고 다음 버전을 정함 |
| 어느 확장 프로그램에 배포 안 한 변경이 있는지 모름 | 표 하나로 전부 보임 |

## 실제 결과

확장 프로그램 "Cover Collage"로 실제로 만든 것:

![홍보 이미지: 색, 글꼴, 직각 모서리는 확장 프로그램 UI에서. 주인공은 확장 프로그램이 만든 커버](assets/examples/promo-marquee.en.png)

![스토어 스크린샷: 사이드 패널을 작동하는 사이트 옆, 브라우저 창 안으로 되돌림](assets/examples/screenshot-sidepanel.png)

배포 전 검사:

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

사이트 권한이 하나 늘었습니다. 링크를 열어 이유를 한 문장 쓰고 저장한 뒤 배포하면 됩니다. 업로드, 제출, 거절을 거친 뒤에야 아는 일이 없습니다.

![배포 흐름: 업로드 전 어느 단계에서든 멈출 수 있음](assets/diagrams/flow.en.svg)

## 시작하기

**1. 설치** (Node 18 이상)

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # 명령어로
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Claude 스킬로 (Codex는 ~/.codex/skills)
```

**2. 스토어 계정 없이 할 수 있는 것**: 확장 프로그램 폴더에서

```bash
xxd-chrome-publish listing .        # 첫 등록 자료 준비
xxd-chrome-publish style .          # UI의 색, 글꼴, 모서리 읽기
xxd-chrome-publish pack . --patch   # 버전을 올리고 업로드할 수 있는 ZIP 만들기
```

**3. 배포할 때 스토어 계정 연결** (한 번만, [단계별 안내](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <대시보드 URL의 ID> --service-account <서비스 계정 이메일>
# 확장 프로그램 폴더마다 한 번
xxd-chrome-publish bind --extension-id <확장 프로그램 ID 또는 스토어 URL>
# 배포
xxd-chrome-publish
```

## 세 가지 상황과 명령

### 첫 등록

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # 코드 읽기 + 패키지 + 대시보드 순서의 뼈대 생성
xxd-chrome-publish privacy-page .                 # 개인정보처리방침 게시, URL을 자료에 채움
xxd-chrome-publish listing . --check              # 남은 작업, Markdown, 긴 요약, 빠진 파일 검사
```

만들어지는 폴더 (바탕화면에 두고 소스에는 넣지 않음):

```
<확장 폴더>-store-assets/
├── fill-text.md               대시보드 순서대로 위에서부터 붙여 넣기
├── upload-files/              아이콘, 스크린샷, 홍보 이미지, 개인정보 페이지, ZIP
├── language-versions/<언어>/  등록 언어별: 붙여 넣을 글, 자세한 설명, 개인정보처리방침
└── working/listing-facts.md   근거: 권한별 사용 위치, 연결하는 서버
```

그다음 대시보드에서 항목을 만들고 ZIP을 올려 붙여 넣습니다. ID가 생기면 `bind`. 첫 배포는 로그인 허용 목록, 심사용 테스트 계정, 공개 지원 페이지를 먼저 확인합니다.

### 스토어 이미지

| 하고 싶은 일 | 명령 |
|---|---|
| 시나리오대로 스토어 스크린샷 촬영 (`--locale ja`는 일본어판) | `xxd-chrome-publish shots . --scenario shots.json` |
| 아이콘과 홍보 이미지에 쓸 UI 스타일 읽기 | `xxd-chrome-publish style .` |
| 16/32/48/128 아이콘, 스토어 아이콘, 확인용 시트 만들기 | `xxd-chrome-publish icon . --svg icon.svg` |
| 홍보 이미지를 렌더링하고 넘침·잘림·줄바꿈 검사 | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| 크기와 투명도를 검사하고 스토어 페이지 미리보기 | `xxd-chrome-publish images .` |

업로드할 이미지는 모두 스토어가 요구하는 투명도 없는 24비트 PNG입니다. 스크린샷에는 Google Chrome이 필요하며, 처음 쓸 때 playwright-core를 `~/.cache`에 설치합니다.

### 매번 업데이트

| 하고 싶은 일 | 명령 |
|---|---|
| 무엇이 일어날지 보기만 (아무것도 안 바꿈) | `xxd-chrome-publish preflight` |
| 업데이트 배포 | `xxd-chrome-publish` |
| 대시보드를 고친 뒤 다시 제출 | `xxd-chrome-publish submit` |
| 심사 진행 확인 | `xxd-chrome-publish status` |
| 폴더 안에서 배포 안 한 변경이 있는 확장 프로그램 보기 | `xxd-chrome-publish scan ~/code` |
| 계정 설정 확인 | `xxd-chrome-publish doctor` |

## AI 어시스턴트에서

스킬로 설치하면 그냥 말하면 됩니다:

- "flomo 확장 프로그램 배포해 줘", "배포할 수 있는 확장 프로그램이 뭐야?"
- "이 확장 프로그램 등록 자료를 일본어, 한국어, 아랍어로도 준비해 줘"
- "UI에 맞춘 스토어 스크린샷 다섯 장과 홍보 이미지를 만들어 줘"

배포할 때마다 정해진 형식의 보고서가 세 가지 사실을 따로 알려 줍니다: 대시보드를 저장했는지, 패키지를 올렸는지, 심사에 제출했는지. 제출을 "게시됨"이라고 하지 않습니다. 게시는 Google 승인 뒤입니다.

## 할 수 없는 일

![도구가 하는 일과 직접 해야 하는 일](assets/diagrams/roles.en.svg)

Google이 API를 제공하지 않아 Chrome 개발자 대시보드에서 해야 하는 일: 항목 만들기, 스토어 설명과 개인정보 답변 붙여 넣기, 이미지 업로드. 도구는 붙여 넣을 글과 이미지를 순서대로 준비하고 대시보드 링크를 알려 줍니다. Chrome은 확장 프로그램이 스토어 페이지를 조작하지 못하게 하므로 확장 프로그램 속 AI 어시스턴트는 입력할 수 없습니다. 컴퓨터를 직접 조작하는 AI라면 입력하고 저장한 뒤 항목별로 다시 확인할 수 있습니다.

## 자세히

<details>
<summary><b>로그인: 둘 중 하나</b></summary>

| 방법 | 적합한 경우 | 필요한 것 |
|---|---|---|
| gcloud + 서비스 계정 | 내 컴퓨터, 키 파일 없이 | Google Cloud SDK와 서비스 계정 |
| OAuth 리프레시 토큰 | CI (GitHub Actions 등) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ 서비스 계정은 대시보드 Account 페이지의 **service account** 칸에 넣습니다. 옆의 "Trusted tester accounts"가 **아닙니다**. 그 칸은 API 권한이 없어 403이 계속됩니다.

단계별 안내: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>배포 옵션 전체</b></summary>

| 옵션 | 동작 |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (기본 1.2.4) |
| `--set-version 1.5.0` | 이 버전으로 |
| `--no-bump` | manifest.json의 버전 그대로 |
| `--skip-build` / `--skip-checks` | 빌드 / 검사 스크립트 건너뜀 |
| `--dashboard-ready` | 대시보드 작업 완료, 계속 진행 |
| `--cancel-pending` | 심사 중인 버전을 철회하고 이 버전을 제출 |
| `--upload-only` | 업로드만, 제출 안 함 |
| `--staged` | 승인 후 직접 게시할 때까지 대기 |
| `--zip file.zip` | 패키지하지 않고 이 ZIP 업로드 |
| `--commit` | 배포 후 버전 변경을 git에 커밋 |
| `--json` | 기계용 출력 |
| `--lang zh` / `--lang en` | 마지막 보고서의 언어, ZIP 파일 이름에 쓸 스토어 이름의 언어. 기본은 시스템 언어 |

종료 코드: `0` 완료 · `1` 오류 · `2` 다른 버전이 심사 중 · `3` 먼저 대시보드 작업.
스토어 이미지 명령의 옵션: `xxd-chrome-publish --help`.

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
| `extensionId` | 스토어 URL의 32글자 |
| `build` | 빌드 명령 또는 `false`. 기본은 package.json의 `build` 스크립트 |
| `check` | 테스트 명령 또는 `false`. 기본은 package.json의 `check` 스크립트 |
| `packageDir` | 패키지할 폴더 (빌드 결과가 `dist`라면 그것) |
| `include` / `exclude` | 항상 넣을 / 항상 뺄 파일 |

</details>

<details>
<summary><b>심사자에게 쓰는 법, 오류 해결</b></summary>

- 첫 등록 항목별 작성법: [references/first-listing.md](references/first-listing.md)
- 스크린샷 시나리오: [references/screenshots.md](references/screenshots.md) · 아이콘과 홍보 이미지: [references/store-images.md](references/store-images.md)
- 통과하기 쉬운 권한 설명: [references/dashboard.md](references/dashboard.md)
- 오류와 해결: [references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>업데이트와 개발</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # 업데이트 (스킬 링크와 명령 모두 여기를 가리킴)
npm test                                # 로컬 가짜 스토어로 테스트, 실제로 배포되지 않음
npm run diagrams                        # build.mjs 문구를 바꾼 뒤 그림 다시 만들기
```

</details>

MIT 라이선스
