# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**이미 Chrome 웹 스토어에 등록된 확장 프로그램**의 업데이트를 터미널에서, 또는 Claude Code / Codex에게
말 한마디로 배포합니다. 빌드, 검사, 패키징, 현재 공개된 버전과의 비교, 업로드, 심사 제출까지 명령 하나로 끝납니다.

일반적인 업로드 스크립트와 가장 다른 점은 **사전 점검(preflight)** 입니다. 업로드하기 전에, 스토어가 무엇 때문에
제출을 거부할지 먼저 알려 줍니다.

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

## 왜 만들었나

Chrome 웹 스토어 API로 할 수 있는 일은 "패키지 업로드"와 "제출"뿐입니다. 권한 사용 사유, 데이터 사용 공개,
개인정보처리방침 URL, 스토어 설명은 **개발자 대시보드에서만 수정할 수 있습니다**. 어떤 CLI(chrome-webstore-upload-cli 포함)도
이 벽을 넘지 못하며, 흔한 증상은 "업로드는 성공했는데 제출할 때 `does not meet the requirements` 오류가 나는" 것입니다.

이 도구는 공개된 패키지를 내려받아 manifest를 로컬 버전과 비교하고, 사유 작성이 필요한 새 권한과 호스트를 목록으로
보여 줍니다. 그 권한을 사용하는 코드 줄도 함께 표시하므로 사유는 1분이면 씁니다. 실제로 자주 겪는 패키징 문제도 해결합니다.

- **지연 주입 파일** — `chrome.scripting.executeScript({ files: [...] })`나 `{ panel: ["build/panel.js"] }` 같은
  방식으로 불러오는 파일도 포함합니다. 참조만 따라가는 zip 도구는 이런 파일을 조용히 빠뜨립니다.
- **오래된 빌드** — 프로젝트의 `build`, `check` 스크립트를 먼저 실행하고, 실패하면 업로드하지 않습니다.
- **없는 파일** — manifest가 가리키지만 존재하지 않는 파일은 업로드 전에 막습니다.
- **버전 충돌** — 다음 버전을 로컬 manifest와 스토어(공개 버전과 심사 중 버전 모두)를 함께 보고 정하므로,
  스토어 쪽이 더 최신이어도 거부되지 않습니다.
- **심사 중인 버전** — 도중에 실패하지 않고 처음부터 알려 줍니다.

## 설치

에이전트 스킬로 (Claude Code, Codex 등):

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex: ~/.codex/skills
```

저장소를 스킬 폴더 밖에 두고 링크하면 `git pull`로 그 자리에서 스킬이 업데이트되고, 일반 프로젝트처럼 수정할 수
있습니다. 그다음에는 "확장 프로그램 배포해 줘", "아직 배포 안 한 변경이 있는 확장 프로그램은?"이라고 말하기만 하면 됩니다.

명령줄 도구로 (Node 18 이상, 의존성 없음):

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # ~/.local/bin/xxd-chrome-publish 로 링크
```

업데이트는 `git -C ~/code/xxd-chrome-publish pull` 한 줄이면 됩니다. 스킬 링크와 CLI 모두 이 저장소를 가리킵니다.

## 최초 설정 (한 번만)

```bash
xxd-chrome-publish setup --publisher-id <대시보드 URL에 있는 ID>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<project>.iam.gserviceaccount.com
#   또는 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN 환경 변수 설정 (OAuth, CI에 적합)
cd my-extension && xxd-chrome-publish bind --extension-id <확장 프로그램 ID 또는 스토어 URL>
xxd-chrome-publish doctor
```

두 가지 인증 방식의 자세한 절차는 [references/setup.md](references/setup.md)(영어)에 있습니다.
서비스 계정은 대시보드 Account 페이지의 **service account** 칸에 넣어야 합니다. 같은 페이지의
"Trusted tester accounts"는 다른 칸이며 API 권한이 없습니다(여기에 넣으면 계속 403이 납니다).

## 사용법

```bash
xxd-chrome-publish preflight        # 무슨 일이 일어날지 확인만 하고 아무것도 바꾸지 않음
xxd-chrome-publish                  # 배포: 빌드 → 검사 → 패키징 → 비교 → 업로드 → 제출
xxd-chrome-publish submit           # 대시보드를 고친 뒤, 이미 업로드된 초안을 제출
xxd-chrome-publish scan ~/code      # 전체 확장 프로그램 현황: 로컬/스토어 버전, 심사 상태, 미배포 커밋
xxd-chrome-publish status | pack | cancel | rollout 50
```

주요 옵션: `--minor`, `--major`, `--set-version X`, `--no-bump`, `--skip-build`, `--skip-checks`,
`--dashboard-ready`, `--cancel-pending`, `--upload-only`, `--staged`, `--zip PATH`, `--commit`, `--json`.
종료 코드: `0` 성공 · `1` 오류 · `2` 심사 중인 버전 있음 · `3` 대시보드 작업이 먼저 필요함.

확장 프로그램별 설정은 `.chrome-publish.json`에 씁니다:

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

## 할 수 없는 것

최초 등록, 스토어 설명과 스크린샷 수정, 개인정보 탭 작성. Google은 이를 위한 API를 제공하지 않고, Chrome은
브라우저 확장 프로그램(AI 브라우저 에이전트 포함)이 웹 스토어 페이지를 조작하는 것도 막습니다. 대신 무엇을 입력해야
하는지 정확히 알려 줍니다. 권한 사유 작성 예시는 [references/dashboard.md](references/dashboard.md)를 참고하세요.

## 개발

```bash
npm test   # 단위 테스트 + 로컬 가짜 웹 스토어를 대상으로 한 E2E 테스트
```

MIT 라이선스.
