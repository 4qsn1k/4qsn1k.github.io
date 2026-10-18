# Codex cloud environment — Airlock Generator

## Актуальный выбор на 18.10.2026

**Новая облачная среда Codex** для `4qsn1k/4qsn1k.github.io`, имя `airlock-generator-dev`, основной каталог `airlock-generator/`, базовая ветка `main`. **Новая задача Codex по Issue #10**: [Generalized FBD graph assembler](https://github.com/4qsn1k/4qsn1k.github.io/issues/10). Старый контекст Issue #3 / QA-OL-012 не запускайте повторно: native A–F уже подтверждены на HOME-PC в тестовом проекте. `docs/CODEX-TASKS.md` содержит актуальные требования.

- **Рассуждения High** по умолчанию, **Extra High** для полной Owen Logic FBD, многоконтроллерной логики и отказобезопасности.
- Начинать **новую задачу**, не продолжать старый длинный чат. Условия и итоги — в GitHub, не в истории чата.
- **Z4559** — физический аппаратный узел ПР100/USB-RS485 и будущий агент. **HOME-PC** — независимая проверка, Owen Logic native GUI и резерв.
- Создана изолированная локальная копия на Z4559: `%USERPROFILE%\AirlockGeneratorLab\source\airlock-generator` (скачан архив `main`, это **не git clone**). `%USERPROFILE%\AirlockGeneratorLab\.venv` содержит pymodbus 3.15.0 и pyserial 3.5. Установлены Node 24/Python 3.13. `npm run check` завершён с PASS 18.10. **Никакого Modbus-запроса к живому прибору не было.**
- Git CLI и Codex CLI **на Z4559 не установлены**. Это не препятствует Codex Cloud: облачная среда использует отдельный GitHub-репозиторий. Не хранить пароли Codex на рабочем компьютере.
- **Статус публикации Codex Cloud: PENDING_USER_UI.** Этот GitHub PR подготавливает среду, но отдельная публикация в Codex требует действия пользователя в ChatGPT/Codex. GitHub-коннектор не создаёт и не публикует облачную среду.
- После авторизации: Codex → Environments / Manage Environments → Create → select repository `4qsn1k/4qsn1k.github.io` → name `airlock-generator-dev` → run setup `cd airlock-generator && bash scripts/codex-setup.sh` → publish → new task with Issue #10. Checks: `cd airlock-generator && bash scripts/codex-check.sh`.
- Рабочие коммиты Codex только в ветку/PR. Нет физического доступа к Z4559/ПР, реальным замкам/СКУД/АПС; без изменений `main` до проверки.


**Repository:** https://github.com/4qsn1k/4qsn1k.github.io  
**Work directory inside repository:** `airlock-generator`  
**Target:** GitHub-backed Codex coding environment for JS, ST code generation, test manifests and PRs. **Not a remote instance of Owen Logic, PR100 or access control.**

## One-time account setup (the user must authorize)

Codex cloud GitHub connection is a separate consent/authorization action. Existing access via ChatGPT's GitHub plugin **does not prove Codex already has access**.

1. Open **Codex** in ChatGPT or the Codex web interface at https://chatgpt.com/codex.
2. Connect the GitHub account that owns `4qsn1k/4qsn1k.github.io` using the Codex GitHub integration, if it is not already connected. Select **only the needed repository** rather than granting all repositories when a selection is available.
3. In Codex, create or select an **environment** for repository `4qsn1k/4qsn1k.github.io`, branch `main`. Name it `airlock-generator` to distinguish it from other website subprojects.
4. Configure Node.js **22** and Python **3.13+**, working directory **`airlock-generator`** where supported. If Codex only allows repository root, prefix setup/test commands with `cd airlock-generator &&`.
5. Set the **setup script** to:
   ```bash
   cd airlock-generator && bash scripts/codex-setup.sh
   ```
   If the environment runs setup scripts with its working directory already set to `airlock-generator`, use `bash scripts/codex-setup.sh`.
6. No `npm install` or external Python dependencies are required for mock tests. No special environment variables or secrets are needed for **read-only software tests and code work**.
7. Test inside Codex terminal:
   ```bash
   cd airlock-generator && bash scripts/codex-check.sh
   ```
8. Ask Codex to work on one well-scoped **GitHub Issue** using `docs/CODEX-TASKS.md`. Require a new branch/PR, not a direct push to `main`.

This repository contains **`airlock-generator/AGENTS.md`**, which defines safety boundaries and coding/testing procedures and is intended to be read by Codex.

## What ChatGPT can do through the current GitHub connector

- Read/write repository documentation and source.
- Open issues, comments, PRs, inspect changes, review GitHub Actions and compare outputs.
- Run Owen Logic GUI simulations **only** when a supported Windows interactive session is available through the remote tools.

## What remains outside the available connector

The current GitHub connection cannot, by itself, create Codex's separate cloud environment or authenticate Codex on the user's behalf. The Codex agent is not currently an invocable tool in this conversation. It cannot be assumed to start work simply because an issue or `AGENTS.md` exists.

**Practical handoff:** ChatGPT creates a GitHub issue with reproducible acceptance criteria and marks it `Codex-ready`. Once the user has connected the Codex GitHub integration, Codex takes this issue in its own environment, commits a branch and opens a PR. ChatGPT then verifies the PR and GitHub Actions and approves further Owen Logic validation only when available.

There is **no authenticated automatic ChatGPT → Codex API bridge** in the present setup. Creating such a bridge would need separately authorized API access or a supported Codex integration. Do not expose Codex tokens in the repository.

## Workflow and checks

- Development scope: `airlock-generator/**` and its dedicated GitHub Action.
- Minimum environment: Node.js 22 + Git + Bash. **No secrets; no PLC network; no physical I/O.**
- Setup: `scripts/codex-setup.sh`.
- Full checks: `scripts/codex-check.sh` or `npm test`.
- CI: `.github/workflows/airlock-generator-qa.yml`; artifacts `airlock-model-qa`.
- Work in `codex/airlock-ISSUE-topic`, open a PR, do not merge without review.
- ST/FBD `.owle` archive format is experimental. Test copy only. Native editor simulation is separate and must have its own factual QA evidence.
- Sensitive operational instructions/credentials are not part of the Codex environment.

## First task

Read [CODEX-TASKS.md](CODEX-TASKS.md), start with Issue #10 **generalized FBD graph assembly** (old two-room QA-OL-012 already native-software-tested): both rooms' shared reed and OR of block requests. Do not claim an Owen Logic FBD build until verified.

## If the environment setup fails

Record the exact failure and dependency mismatch in the GitHub issue/PR. Avoid installing privileged packages or changing repository root as a workaround. It is acceptable to run the existing tests in GitHub Actions while Codex account connection is being completed.

References: OpenAI's [Codex workflows](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) and [GitHub connection guidance](https://help.openai.com/en/articles/11145903-codex-cli-getting-started).
