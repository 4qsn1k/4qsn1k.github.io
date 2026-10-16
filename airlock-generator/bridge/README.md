# Owen Logic Bridge — управление через интерфейс Windows

Статус: **v0.2**. Чтение, изменение симуляционного входа через диалог Windows UI Automation и повторная проверка результата подтверждены на Z4559. Если Owen Logic не активен, команда прекращается с `FOREGROUND_NOT_OWEN`.

## Назначение

Мост устраняет необходимость искать сигналы на скриншотах. ChatGPT может обращаться к нему через уже установленный Remote Desktop Commander (RDC) и получать структурированные JSON-ответы о настоящем симуляторе Owen Logic.

```
ChatGPT → Remote Desktop Commander (Z4559)
        → PowerShell-скрипт owen-bridge.ps1
        → Windows UI Automation
        → Owen Logic, редактор ST
        → JSON (состояния входов/выходов)
```

Мост не использует сетевой сервер, не открывает TCP-порты и не требует ключей API. Он не записывает прошивку, не управляет физическими замками и не меняет исходный `.owle`.

## Расположение

- На рабочем ПК Z4559: `%USERPROFILE%\Desktop\AirlockGeneratorTest\owen-bridge.ps1`.
- В GitHub: `airlock-generator/bridge/owen-bridge.ps1`.
- Тестовая копия проекта: `%USERPROFILE%\Desktop\AirlockGeneratorTest\Airlock_SIMULATION_TEST.owle`.
- Привязка к конкретной копии выполнена по точному заголовку окна `Airlock_SIMULATION_TEST.owle`.

## Команды

Запускать на Z4559 в PowerShell. Здесь `$bridge` — локальный путь до скрипта:

```powershell
$bridge = "$env:USERPROFILE\Desktop\AirlockGeneratorTest\owen-bridge.ps1"

# Список всех входов и выходов активного ST-блока
powershell -NoProfile -ExecutionPolicy Bypass -File $bridge -Action inspect

# Текущий снимок контрольных сигналов блока FB_Room_N1
powershell -NoProfile -ExecutionPolicy Bypass -File $bridge -Action status

# Одно значение, найденное по имени переменной
powershell -NoProfile -ExecutionPolicy Bypass -File $bridge -Action read -Name I_D_1_2_Closed

# Предварительная проверка команды: никаких кликов
powershell -NoProfile -ExecutionPolicy Bypass -File $bridge -Action set-input -Name I_D_1_2_Closed -Value TRUE

# Экспериментальное изменение входа: включается только при -Apply
# СРАБОТАЕТ ТОЛЬКО если активное окно — тестовая копия Owen Logic.
powershell -NoProfile -ExecutionPolicy Bypass -File $bridge -Action set-input -Name I_D_1_2_Closed -Value TRUE -Apply
```

Для вызова через ChatGPT используется Remote Desktop Commander и эта же команда. Все ответы — JSON с полями `ok`, `action`, `project`, `block`, `timestamp` и результатами.

## Результаты испытаний моста

| Проверка | Результат |
|---|---|
| BRIDGE-001: Найти Owen Logic по процессу/названию тестового проекта | PASS |
| BRIDGE-002: Найти редактор ST по AutomationId | PASS |
| BRIDGE-003: Прочитать текст ST через TextPattern | PASS, 7972 символа |
| BRIDGE-004: Сопоставить видимые Boolean/UDINT значения с именами сигналов | PASS |
| BRIDGE-005: Считать `O_State=20` и текущие команды блокировок | PASS |
| BRIDGE-006: Сухая проверка `I_D_1_2_Closed → TRUE` | PASS, ничего не менялось |
| BRIDGE-007: Запретить прямую запись в `O_Red` | PASS, `NOT_AN_INPUT` |
| BRIDGE-008: Изменить `I_D_1_2_Closed` без активного окна | Блокировано безопасно: `FOREGROUND_NOT_OWEN` |
| BRIDGE-009: Смена `I_D_1_2_Closed=FALSE → TRUE`, подтверждённая повторным чтением | **PASS** |

**Далее подтверждён QA-OL-004 и QA-OL-005:** закрытие 1–2, 30-секундная продувка и возврат в READY. При тестировании v0.2 дверь повторно открыта (`I_D_1_2_Closed=FALSE`, `State=20`). Следующее действие — закрыть её и перейти к QA-OL-006.

## Реализованное изменение входа (v0.2)

В Owen Logic индикация переменной не поддерживает прямой `ValuePattern`, но нажатие на неё открывает WPF-диалог «Изменить значение». Мост находит этот диалог по PID и **точному имени входа**, переключает значение через `TogglePattern`, включает галочку фиксации и подтверждает через `InvokePattern`. После закрытия диалога мост повторно считывает переменную и только при совпадении возвращает `CHANGED_AND_VERIFIED`.

Доказанные сценарии: `FALSE → TRUE` (после первого ручного открытия диалога); `TRUE → FALSE` выполнен одной командой моста `set-input -Apply` от начала до конца. Команда остаётся зависима от активного окна тестового Owen Logic. При фокусе Firefox получено `FOREGROUND_NOT_OWEN`, ничего не изменено.

Чтобы увидеть вывод обычным двойным щелчком, запускай **`owen-bridge-status.cmd`** из папки AirlockGeneratorTest. Он открывает консоль с JSON и ждёт нажатия клавиши. `owen-bridge.ps1` — CLI без собственного окна. Для вызова из ChatGPT подходит существующий Desktop Commander.

### Дальнейшие задачи

1. Автоматически записывать снимки и проходящие проверки в журнал GitHub.
2. Поддержать универсальные входы и состояния различных ST-блоков (сейчас `status` ориентирован на FB_Room_N1).
3. Отделить графический симулятор Owen Logic от других запущенных копий; ни при каких условиях не управлять рабочим ПР.
4. Испытать таймер открытия, неисправность, пожар и FB_Room_N4, затем FBD-объединение дверных запретов.

## Ограничения безопасности

- Жёсткая привязка к тестовому `Airlock_SIMULATION_TEST.owle`.
- Перед действием проверяется ожидаемое имя блока (по умолчанию `FB_Room_N1`).
- Для записи допускаются только значения `TRUE` / `FALSE` и только имена из секции `VAR_INPUT`.
- Изменение требует `-Apply`; без флага выполняется сухая проверка.
- После попытки клика значение считывается повторно. Без подтверждения команда **не считается выполненной**.
- ПЛК, реле замков, аварийное отпирание, С2000-2 и сетевые интерфейсы не затрагиваются.

Все операции должны выполняться сначала на тестовом проекте и в симуляторе, а реальные блокировки/пожарное освобождение необходимо проверять на испытательном стенде с профильным инженером.
