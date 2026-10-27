---
name: commit-release
description: 사용자가 "커밋해줘", "커밋 해", "commit 해줘"처럼 실제 커밋을 요청할 때 사용. version 스킬 규칙으로 올릴 버전을 판단하고 commit 스킬 규칙으로 메시지를 만든 뒤, 사용자 확인을 받고 버전 파일·CHANGELOG 갱신과 함께 커밋한다. 태그와 push는 하지 않는다. 메시지만 원하면 /commit, 버전만 원하면 /version을 쓴다.
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git tag --list:*), Bash(git describe:*), Bash(git add:*), Bash(git commit:*), Read, Edit, Write, Glob, Grep
---

# commit-release

버전 판단과 커밋 메시지 생성을 묶어 **확인을 받은 뒤 실제로 커밋**한다.
세부 규칙은 두 스킬 파일을 그대로 따른다. 이 파일은 순서와 예외만 정한다.

- 버전 규칙: `.claude/skills/version/SKILL.md`
- 메시지 규칙: `.claude/skills/commit/SKILL.md`

시작할 때 두 파일을 읽는다. 둘이 충돌하면 이 파일의 내용이 우선한다.

## 절차

1. **사전 확인** — `git status`로 git 저장소인지와 변경이 있는지 확인한다. 저장소가 아니거나 변경이 없으면 그 사실을 알리고 멈춘다.

2. **버전 판단 (파일은 아직 수정하지 않음)** — version 스킬의 절차 1~4로 현재 버전, 비교 기준점, 올릴 단계를 정한다. 사용자가 단계나 버전을 함께 말했으면(예: "minor로 올려서 커밋해줘") 그것을 따른다.
   - '올리지 않음'이면 버전·CHANGELOG 없이 커밋만 진행한다.
   - 단계가 애매하면 후보와 근거를 확인 단계에서 함께 보여주고 고르게 한다.

3. **메시지 생성** — commit 스킬 규칙으로 메시지를 만든다. 버전을 올리는 경우 본문 마지막 불릿에 `- VERSION: <이전> → <새 버전>` (실제 버전 파일 이름 사용)과 `- CHANGELOG.md: <새 버전> 항목 추가`를 넣는다.
   - 변경이 여러 목적으로 섞여 있으면 commit 스킬처럼 나눠 제안하되, 버전 반영은 마지막 커밋 하나에만 포함한다.

4. **확인 받기** — 아래 내용을 보여주고 사용자 답을 기다린다. 승인 전에는 어떤 파일도 수정하거나 스테이징하지 않는다.
   - 버전: `<이전> → <새 버전>` (단계와 근거 한 줄), 또는 "버전 변경 없음"
   - 추가할 CHANGELOG 항목 미리보기
   - 커밋 메시지 (코드 블록)
   - 커밋에 포함할 파일 목록과 제외할 파일(경고 대상)
   
   사용자가 수정을 요청하면 반영해서 다시 보여주고, 취소하면 아무것도 바꾸지 않고 멈춘다.

5. **반영 및 커밋** — 승인되면:
   1. version 스킬의 절차 5로 버전 파일과 `CHANGELOG.md`를 갱신한다.
   2. 확인받은 파일만 `git add <파일...>`로 스테이징한다 (`git add -A`, `git add .` 사용 금지). 경고 대상 파일(`.claude/settings.local.json`, `.env` 등 비밀 값, `node_modules/`, 빌드 산출물, 로그)은 제외한다.
   3. 확인받은 메시지 그대로 `git commit`한다. 여러 줄 메시지는 heredoc 또는 `-F`로 전달한다.
   4. pre-commit 훅이 실패하면 `--no-verify`로 우회하지 말고, 실패 내용을 보여주고 멈춘다.

6. **보고** — `git log -n 1 --stat`로 만들어진 커밋을 확인해 해시, 제목, 새 버전을 알려준다.

## 두 스킬 규칙에 대한 예외

- commit·version 스킬의 '금지' 항목 중 `git add`와 `git commit`은 이 스킬에서, 4단계의 사용자 승인 뒤에만 허용한다.
- 메시지에 `Co-Authored-By` 등 attribution 줄을 넣지 않는 commit 스킬 규칙은 그대로 지킨다.

## 금지

- `git tag`, `git push`, `git reset`, `git commit --amend`, `git rebase` 실행 금지. 태그가 필요하면 `git tag v<새 버전>` 명령을 안내만 한다.
- 사용자 승인 없이 파일 수정·스테이징·커밋 금지.
