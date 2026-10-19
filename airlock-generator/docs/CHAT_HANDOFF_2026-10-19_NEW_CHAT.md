# Airlock Generator — передача в новый чат (19.10.2026)

**Задача:** восстановить разработку после лимита длины обсуждения. Главный источник полной истории — docs/CURRENT_CHECKPOINT_2026-10-19.md, затем docs/CHECKPOINT.json и docs/CHAT_CONTINUITY.md. Исторические сведения в старом журнале могут устареть.

## СРОЧНО: COM5 НЕ ЗАНИМАТЬ до разрешения пользователя

Непосредственно перед переносом пользователь попросил освободить COM-порт примерно на пять минут для диагностики китайской панели и обещал лично дать команду «продолжить». **Не возобновлять SCADA Agent, Modbus probe, опрос ПР100 или использование COM5 до явного разрешения пользователя.** Нельзя автоматически возобновлять по истечении пяти минут. Продолжать можно только офлайн-разработку, GitHub и тесты, не открывающие COM5.

19.10.2026 пассивно проверено на Z4559:
- LISTENER_8787_COUNT=0 — локальный Airlock HTTP сервер не работает.
- STOP_FLAG_PRESENT=True — ранее созданный флаг штатной остановки агента сохранён.
- LIVE_AGENT_PID_FILE_PRESENT=False — нет PID-файла ручного сервера.
- Пассивная проверка не открывала COM5; она НЕ доказывает, что чужая программа не заняла порт.
- Служба автозапуска агента Windows не установлена.
- Не закрывать сторонние приложения пользователя (UPROG, диагностическая китайская панель, Owen Logic).

## Проект и роли оборудования

Репозиторий: https://github.com/4qsn1k/4qsn1k.github.io
Каталог: airlock-generator/
Главная ветка: main; видимый последний HEAD на момент передачи: ac48be01ccc0769c03c39b0060d9aef4f1c680fc (проверить HEAD снова перед коммитами).
Codex Cloud: опубликованная среда airlock-generator-dev. Для сложного native Owen Logic — новая задача Extra High, прочие большие задачи — High.
Z4559 (Remote Desktop Commander ID 74ec168b-bf90-4a08-ad7c-94b3ec6037ae): реальный испытательный ПР100, USB-RS485, локальный агент. Файлы AirlockGeneratorLab. Не трогать старый проект skud-kpp2.
HOME-PC (Remote Desktop Commander ID add51f38-9a08-4780-86ce-ab1030d20ebf): Owen Logic 3.3.378, GUI и независимая симуляция. Не трогать реальные контроллеры.
Автономный QA: scripts/codex-check.sh, Windows: npm.cmd run check.

## Фактически завершённые PR

- PR #13 merged: https://github.com/4qsn1k/4qsn1k.github.io/pull/13 — typed FBD graph, общие двери OR, проектное I/O, ограничение GREEN, JSON/CSV/ST. FBD_PLAN_PASS. НЕ произвольный рабочий OWLE.
- PR #16 merged: https://github.com/4qsn1k/4qsn1k.github.io/pull/16 — persistent/one-shot read-only Modbus, bounded queue, watchdog, независимо опрашиваемые ПР.
- PR #18 merged: https://github.com/4qsn1k/4qsn1k.github.io/pull/18 — read-only OWLE ZIP inspector, UUID references, диагностический код port type 4, схема/fixtures, QA. Произвольный OWLE writer НЕ завершён.
- PR #19 merged: https://github.com/4qsn1k/4qsn1k.github.io/pull/19 — реальные Modbus-измерения ПР100.
- PR #20 merged: https://github.com/4qsn1k/4qsn1k.github.io/pull/20 — кнопки SCADA «Освободить порт» / «Возобновить опрос», предупреждения, ожидание закрытия последовательного процесса до подтверждения, данные в OFFLINE/UNKNOWN, защита от позднего ответа. 6/6 offline тестов + полный QA, CI PASS; НА РЕАЛЬНОМ COM5 кнопки ещё НЕ испытаны.
- Issue #14 остаётся: https://github.com/4qsn1k/4qsn1k.github.io/issues/14

## Реальный ПР100 на Z4559

Экспериментальный OWEN PR100-24.1208.03.1 [M02], штатное питание, DIP «Работа». CP210x USB-RS485 COM5. Modbus RTU 9600 8N1, Slave ID 16.

Подтверждено физическим прибором и лично пользователем по светодиодам:
- FC02 4096..4103: DI1..DI8 = 0,0,1,0,0,0,0,0.
- FC01 0..7: Q1..Q8 = 0,1,1,1,0,0,0,0.
- One-shot переоткрытие порта: только 4/10 ONLINE, иногда Access denied.
- Persistent agent: 11/12 успешных выборок, автоматическое восстановление после RTU_UNAVAILABLE, ответ ~60–64 мс.
- Локальная SCADA проверена по HTTP /api/status, /api/project, /api/events, но модель 6 помещений/8 дверей только ДЕМОНСТРАЦИОННАЯ. Достоверных ROOM.State, FireNormal, GREEN/READY для этого ПР не назначали.
- Ни одного Modbus write FC05/06/15/16, никаких команд замкам или загрузок прошивки.
- На момент переноса агент ОСТАНОВЛЕН. COM5 оставить пользователю для сторонней диагностики.

## Native Owen Logic на HOME-PC

Исходный исключительно тестовый Airlock_FBD_QA012_HOME.owle SHA256 0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00, 25 элементов, 16 соединений.
В испытательных блоках подтверждались QA-OL-006 и QA-OL-012 с общей дверью и OR. Это НЕ произвольная генерация OWLE.

Код порта типа 4 присутствует четырежды, его смысл НЕ подтверждён; inspector --diagnostic выдает NATIVE_TYPE_UNSUPPORTED_DIAGNOSTIC_ONLY, но строгий native writer такой тип не принимает.

Отдельная remapped-копия Airlock_NATIVE_14_UUID_REMAP_TEST_20261019.owle SHA256 35A3E289116C7924B398999AD68183CEA90927FFA59131A031DB49DD77BEB7A8, 187 обновлённых UUID. Третий экземпляр GUI Owen Logic ОТКРЫЛ И ОТРИСОВАЛ ЭТУ КОПИЮ. НЕТ подтверждённого сохранения, компиляции, симуляции или автоматически сгенерированного нового проекта. NATIVE_GUI_OPEN_AND_RENDER_OBSERVED, OWLE_ARBITRARY_NATIVE_COMPILE_PASS=false.

## Что делать далее

1. До разрешения на COM5: только офлайн Issue #14, валидаторы native writer, интеграция ST/FB и проектная документация. Не пробовать «проверить порт».
2. Исследовать на HOME-PC только отдельные тестовые копии Owen Logic без реального ПР и без утверждений непроверенных результатов.
3. Для полного OWLE нужны подтверждённые native metadata DI/DO/OR/FB, GUID/geometry, определения ST, связывание интерфейсов, тест открытие→сохранение→компиляция→симуляция нового файла.
4. Для настоящих шлюзов подтвердить фактическую карту программных переменных ПР, аппаратное fail-safe, пожарную эвакуацию, независимые цепи замков и полные сценарии отказов. Нельзя выводить GREEN из одних диагностических DI/Q.
5. Только после явной команды пользователя использовать COM5: проверить, что сторонняя диагностическая программа закрыта; испытать ONLINE→RELEASE→OFFLINE→RESUME→ONLINE с физическим ПР100. Службу автозапуска не устанавливать без согласования.

## Основные источники

- docs/CURRENT_CHECKPOINT_2026-10-19.md — текущая авторитетная сводка, включая точные коммиты и native GUI.
- docs/CHECKPOINT.json — структурированные QA.
- docs/CHAT_CONTINUITY.md — архив исторического чата.
- docs/PR100-Z4559-REAL-MODBUS-QA-2026-10-19.md — аппаратная диагностика.
- docs/SCADA-COM-PORT-MAINTENANCE-2026-10-19.md — управление COM.
- docs/OWLE-NATIVE-SERIALIZATION-ISSUE-14.md — требования native.
- docs/CODEX-ENVIRONMENT.md — конфигурация Codex.

**Первое действие нового чата:** прочитать этот файл и актуальную сводку; подтвердить запрет на COM5; выбрать следующую офлайн-задачу, не повторяя завершённые PR.
