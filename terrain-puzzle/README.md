# Terrain Puzzle Generator v2.6

**Рабочий сайт:** https://4qsn1k.github.io/terrain-puzzle/

Создаёт рельефные STL из открытых данных высот и делит крупные модели на стыкующиеся плитки. Всё работает в браузере без отдельного сервера.

## Управление сеткой и ограничения (v1.5)

- Готовая сетка 2×2 появляется на карте при запуске.
- Перетащи белый угол для изменения размера; сам квадрат всегда остаётся квадратным.
- Перетащи центральный круг или внутреннюю область сетки для её перемещения.
- Для точного выравнивания используйте стрелки и шаг 10, 50, 100 либо 500 м. Перемещается вся сетка без изменения её стороны.
- Выбор 1×1–6×6 и детализации 0,5–8 мм. Недопустимые варианты недоступны и помечены причиной ограничения.
- Рабочая зона одной детали выбирается из 150/180/200/210 мм. По умолчанию 200 мм. Более крупные варианты размера отключаются.
- Оценка количества треугольников и примерного объёма STL показывается до генерации.
- После загрузки реальных высот недопустимые множители вертикального преувеличения отключаются при превышении 210 мм.
- Ограничения введены для защиты памяти браузера и выбранной рабочей зоны, а не потому, что в местности отсутствуют данные высот.

## Печать для типографии (v1.5)

- Поддерживаются форматы A4, A3, A2, A1, A0 (841 × 1189 мм), книжная, альбомная или автоматическая ориентация.
- DPI: 150/200/300/400/600. Доступность зависит от числа листов и лимита 190 мегапикселей на экспорт, а не от одного лишь формата. **A0 300 DPI доступен для одного листа**.
- Расчётный цветной рельеф на весь лист создаётся полосами по 1024 × 1024 пикселя. PDF содержит изображения в физическом размере, а не растянутый снимок экрана. Подписи и границы страницы заданы PDF-командами.
- PDF 1.4, RGB, физический масштаб MediaBox. Для типографии: печать 100%, без «уместить на странице». При необходимости CMYK / PDF/X преобразуй в типографии.
- Формат A0 300 DPI проверен автоматическим экспортом: 841 × 1189 мм, 140 независимых фрагментов изображения, 133.9 млн пикселей в печатной области.
- Высокий DPI не улучшает точность исходного DEM. Генератор показывает разрешение тайлов высот в масштабе карты, если DEM уже загружен. Это примерная характеристика, не сертификат геодезической точности.

## Управление объёмной моделью (v1.5)

- Горизонтальное вращение в нижней части окна следует противоположному направлению относительно верхней части.
- Колесо мыши, жест двух пальцев и кнопки +/− управляют приближением.
- Два пальца, Shift + перетаскивание или правая/средняя кнопка позволяют сдвигать камеру.
- Кнопки: весь макет, изометрия, вид сверху, сброс. Видимые границы деталей и каркас переключаются.
- Есть встроенная справка «Как пользоваться». Кнопки снабжены поясняющими подсказками.

## Выбор STL-масштаба (v1.5)

- У каждой строки масштаба показывается требуемая сетка X×X.
- Варианты, превышающие 6×6 деталей или бюджет треугольников, отключены до экспорта.
- При изменении размера одной детали сохраняется выделенная географическая область; количество плиток автоматически пересчитывается.
- Пример: участок 12 км по стороне при 200 мм, шаг 4 мм: масштабы 1:5000 и 1:10000 недоступны, а 1:15000 допустим (5×5).
- Плотность DEM и 3D-меша — разные параметры. Сгущение сетки не добавляет отсутствующих географических деталей.

## v1.6 — первая доработка по результатам технического аудита

[Технический аудит шести аналогичных генераторов](docs/TECHNICAL_AUDIT_2026-10-24.md) — источники высот, модели данных, пазлы, цвет и удобство использования.

В предыдущих версиях исходный Mapzen Terrarium был искусственно ограничен масштабом тайлов Z13. Теперь допускается загрузка Z15 при бюджетном ограничении 72 тайла. Для небольшого участка Белорецка проверены 49 плиток Z15, запись уровня и шага пикселя в project.json, замкнутость STL. **Шаг Z15 (примерно 2,8 м на этой широте) не означает, что первичный DEM имеет точность 2,8 м**. Реальные исходные данные могут иметь шаг около 30 м.

Кнопка «Проверить данные высот» показывает источник, количество файлов, размер пикселя запрошенного растра и расстояние между вершинами в метрах на местности. После изменения координат/масштаба сведения требуют повторной проверки.

Mapterhorn в тестовой точке (53.96,58.30) Z10 и Z12 доступен, а Z13–Z16 возвращает 404. Автоматическую подмену без учёта реального покрытия не выполняем.

## v2.0 — объединение геометрии Codex и модулей DEM (24.10.2026)

- Геометрия из PR #34: единый Float64 height-field и общие швы пазлов, топологические тесты.
- DEM из PR #33: Mapzen PNG 256 px и Mapterhorn WebP 512 px, проверка NoData; при отказе одного источника возможен явный резерв. Источники **не смешиваются** в одном проекте, исходная точность не выводится из номера зума.
- Географические расстояния считаются по WGS84/UTM, для центра участка фиксируется зона проекции, код EPSG включён в манифест. Полярные области вне 80°S–84°N не поддерживаются.
- Проект сохраняется/восстанавливается как JSON, настройки печати и география включены.
- GPX, KML, GeoJSON: загруженные маршруты отображаются на карте и в 3D-просмотре. В ZIP добавляется ROUTE/route.geojson. **Рельефный маршрут не экструдируется в STL**.
- Опционально: отдельный 3MF на каждую плитку. Поверхность окрашена шестью материалами по высотным зонам; STL сохраняется. Для фактической печати несколькими цветами настройка слайсера требуется отдельно.
- A0 300 DPI и схема сборки сохранены.
- Добавлен GitHub Actions workflow для тестов геометрии, проекции и DEM.
- **Границы ответственности**: карты дорог и границ леса из OSM, ESA WorldCover, контурные линии векторного PDF, магнитные замки и физическая печать пазлов не входят в этот выпуск. Не считать их внедрёнными.

## v2.1 — реальные географические слои и миниатюрные деревья

- Слои OpenStreetMap: реальные лесные контуры natural=wood / landuse=forest, реки, ручьи, водные полигоны, дороги, отдельные деревья.
- Загрузка через публичный Overpass по небольшой выбранной области. Доступность зависит от сети и API. При отказе можно импортировать .osm/.xml (OpenStreetMap Export) или GeoJSON вручную.
- Вид ели (Picea), сосны (Pinus), берёзы (Betula) распознаётся исключительно по тегам species/genus. leaf_type позволяет различать общий хвойный/лиственный/смешанный лес. Если данные не указаны, дерево имеет условную форму. **Это не достоверная карта пород деревьев в лесу**.
- В 3D: процедурные модели деревьев (символьное преувеличение по размеру и высоте), синие водные полосы и полигоны, коричневые дороги.
- В A0 PDF и PNG-раскрасках поверх DEM отображаются реальные цветные лесные контуры, вода, дороги и GPX-маршрут. Атрибуция OSM присутствует.
- В цветном 3MF дополнительные материалы: реки/вода, хвойный/лиственный/неуказанный лес, дороги. Детализация сетки STL ограничивает узкие объекты. **STL земли не модифицируется:** реки визуально отмечены на поверхности, но не прорезаны.
- Экспорт ZIP может включать GEO/landcover.geojson, FOREST/*_TREES_SEPARATE_PRINT.stl, FOREST/placements.json. **Деревья не слиты с основной деталью:** их печатают отдельно на столе и приклеивают к координатам.
- Деревья схематические, не реконструируют реальную крону/высоту/возраст.
- Слои OSM сохраняются в проект JSON, при восстановлении сеть не требуется.
- © OpenStreetMap contributors; ODbL. Геометрия может быть неполной. Отверстия сложных multipolygon не обрабатываются.
- До 1400 OSM-объектов за запрос и до 1000 деревьев в 3D. Большие области требуют уменьшения участка или импорта подготовленного GeoJSON.
- Лесотаксационные сведения о породах и возрасте деревьев требуют отдельного лицензированного набора данных, в данной версии их нет.

## v2.2 — проще интерфейс, плавный 3D, проверяемая загрузка OSM

**Что исправлено:**
- В боковой панели осталось четыре последовательных шага: участок, рельеф, природа, экспорт. Сохранение проекта, GPS и бумажные PDF перенесены в раскрывающийся раздел «Дополнительно». Настройки источника DEM и предельных размеров доступны во вложенных расширенных параметрах, не потеряны.
- Кнопка «Загрузить природу» вынесена в панель карты и секцию «Леса, реки, дороги». Результат явно показан на карте с отчётом: источник, фактический географический охват, число объектов из ответа, число принятых объектов и лесные/водные/дорожные категории.
- **Маленькие районы:** сначала OpenStreetMap Map API (без ожидания трех слабых Overpass-серверов); официальное чтение .osm XML. Для больших районов — несколько Overpass-инстансов параллельно и разумный тайм-аут. При отказе ошибка показывается, нулевой результат не выдается за удачную обработку.
- **Плавный 3D:** сглаживание движения камеры в реальном времени, инерция после вращения, плавное приближение, нормали рельефа интерполируются по вершинам вместо резкого треугольного освещения. Это касается предпросмотра; исходные STL-координаты не меняются.
- Базовый шаг 3D-сетки 2 мм вместо 4 мм для новых проектов, восстановленные JSON-проекты сохраняют своё значение. Профили ограничений по памяти/размерам остаются активны.
- Для лесов ОSM ботанический вид неизвестен, если нет корректного species/genus; это указано в статусе.
- Для текущей ручной выборки около Белорецка (1200×1200 м; 53.9625 N, 58.305 E) ответ официального OSM API получен в браузере за ~0,5 с: 4 лесных контура, 3 реки/ручья, 4 дороги. Данные актуальны только для времени проверки; это не воспроизводимый обещанный API SLA.

**Ограничения:** публичные API могут не отвечать и имеют правила допустимой нагрузки. Для больших территорий нужна подготовленная OSM-выгрузка или собственный сервер. Многоконтурные полигоны с дырками и точная ботаника OSM не гарантированы. Интерфейс теперь уведомляет, что при перемещении сетки геослои относятся к старой области.

## v2.3 — topographic map draped on 3D, wide watercourses, readable labels

- A small *on-demand* OpenTopoMap raster atlas (max 12 tiles, no bulk download) is projected directly onto the WebGL model in UTM coordinates. Contours, topographic symbols and cartographic names appear on the surface. A fallback altitude tint is shown if the provider is unavailable. Texture is cached in this browser session; source attribution is visible.
- Local 3D labels are projected from actual OSM features: waterways, forests and roads.
- OSM \`natural=water\` closed ways are polygon surface objects. OSM \`waterway=river/stream\` linear geometry becomes a continuous connected strip rather than separate quad fragments.
- If mapped banks are absent, a clearly labelled **illustrative** watercourse width is configurable (20–150 m in geographic units) for 3D **preview only**. This also applies if OSM marks it as \`stream\`. No physical flood extent, hydrology or water level is inferred. Only actual polygons are factual mapped banks.
- Optional topo imagery and supplementary river width are display settings; **3D-printed STL terrain geometry is unchanged**. Colour-3MF continues to use vector OSM classes. PDF maps retain their separate DEM-derived raster plus vector overlays.
- Topographic tiles load asynchronously *after* the basic terrain appears; 2 concurrent requests, 35 s timeout, cache of recent atlases. Requires network access to the third-party tile provider.
- More informative 3D legend and source notice; irrelevant grid help is hidden while viewing 3D. Added offline tests for atlas tile budget, width control and continuous ribbon geometry.

## v2.4 — independent 3D view scale and truthful topographic detail

- Two different controls: **3D view scale** (40–220% of fit) adjusts only the camera, allowing the full model to fit without changing geographic area/physical STL sizes. \`Весь макет\` recalculates the camera distance using the viewport aspect ratio and bounding sphere (including vertical exaggeration).
- **Topo map detail** is a separate raster source selection: Auto ≤12 tiles, Detail ≤24, Maximum ≤36 tiles, up to source zoom 15 and at most 2048px per mosaic side. It never downloads several zoom levels automatically; only the explicitly viewed topographic layer is fetched.
- For each option, the interface shows actual zoom Z and planned tile count. A higher detail mode is **disabled** when it would use the same map zoom as Auto or exceeds atlas/GPU limits; do not falsely suggest more DEM accuracy.
- A status field gives geographic footprint in km, raster map pixel ground spacing (which is NOT elevation accuracy), and reports tiles actually loaded. It does not claim new cartographic features if the map provider has no higher zoom.
- Previous atlas imagery stays visible if a more detailed request fails, and network error is reported. Session cache is capped to three recent mosaics; explicit choices respect third-party tile-service capacity.
- Projection, terrain mesh, STL, PDF/A0, tile count and geographic selection **remain independent** of these visualization controls. Topo detail persists in project JSON. Added Node tests for unavailable options, dynamic texture limits and zoom budget.

Third-party map service restrictions and source detail still apply. This release does not generate higher precision DEM, and raster overzoom is not substituted for actual map detail.

## v2.5 — large reservoirs, model refresh, 3D workspace

- OSM XML now reads multipolygon relations referencing ways and nodes. Fragmented/reversed outer and inner ways are joined only when they form genuinely closed loops. Incomplete geometry is **not** converted to invented shorelines.
- Overpass JSON relations with segmented outer and inner members are joined by geographic endpoints. Island holes remain holes in Leaflet map, WebGL water overlay, PDF/PNG print and 3MF materials.
- Reservoir tags \`natural=water\`, \`water=reservoir\` and legacy \`landuse=reservoir\` are supported, with \`relation\` or \`way\` elements queried. A visible counter distinguishes reservoirs from other water polygons.
- A manual, visible **«↻ Обновить 3D»** control rebuilds the model. Previously the control was hidden by CSS. Browser \`Ctrl+F5\` reloads the code; the OSM reload button is separate.
- The 3D workspace hides irrelevant map-editing controls and summary cards, giving more height to the model. **«На весь экран»** expands the 3D area to the full viewport and **Escape** returns to regular mode. It does not change STL dimensions or geography.
- When the small official OSM API responds without a water polygon, a separate targeted Overpass query attempts to recover complete reservoir multipolygons **without delaying initial map rendering**. The interface explicitly reports failure; no artificial shoreline polygon is generated.
- The XML/Overpass parser preserves OSM factual shorelines and holes, but a reservoir whose complete outer boundary cannot be retrieved still will not be rendered. If a reservoir is outside the current selected footprint it cannot appear. For very large relations, use an appropriate Overpass extraction or manually imported complete GeoJSON/OSM.
- The configured river-width slider remains an **illustrative preview setting** when mapped shorelines are unavailable, not a hydraulic flood simulation.

## v2.6 — переработанный интерфейс

Переработана организация генератора без изменения геометрии STL и API данных.

- **Шесть рабочих этапов** в боковой навигации: «Участок», «Рельеф», «Природа», «3D и STL», «Карта PDF», «Проект». Вместо длинной общей панели одновременно открыты настройки только одного этапа.
- **Рабочая область — главная.** На десктопе экран состоит из узкого меню (76 px), настроек (328 px) и большой карты/3D-сцены. Навигацию и панель можно свернуть.
- Сокращено количество постоянно видимых элементов 3D-панели. Дополнительные «Топографическая карта», «Детализация», «Масштаб вида», «Ширина реки», «Каркас/Границы» перенесены в **«Вид и слои»**. Основные действия: «Обновить 3D», «На весь экран», «Весь макет», «Изометрия», «Сверху».
- В разделе «Участок» есть крупные действия «Рамка по карте» и «Показать участок». В «Рельефе» — «Подобрать масштаб» и «3D-проверка». В «Экспорте» — быстрый переход к просмотру и генерации STL.
- Контекстный статус OSM открывает этап «Природа» по нажатию и позволяет прочитать фактическую ошибку вместо недоступного сообщения.
- На телефонах **карта открывается первой**. Навигация превращается в горизонтальные закладки, а настройки открываются по выбору этапа. Лишние карточки статистики скрыты.
- Ничего не удалено: все старые формы STL, PDF A0, точного перемещения сетки, проектов JSON, GPX, OSM и экспорта доступны.
- Переходы переключают реальные элементы DOM, без клонирования контролов. События, привязанные к ним, сохранены. Выбранный этап сохраняется в рамках вкладки браузера.
- Ctrl+F5 / Ctrl+Shift+R — обновить веб-версию; «Обновить 3D» — перестроить текущий макет; «Загрузить природу» — обновить слой OSM.

## Возможности

- Выбор двумя кликами на карте или двумя противоположными углами в широте/долготе.
- Вставка десятичных координат в одном поле и полных ссылок Google Maps, Яндекс Карты, OpenStreetMap.
- Короткие ссылки Google/Yandex без координат нужно сначала открыть в карте и скопировать полный адрес.
- Карты OpenStreetMap, OpenTopoMap и спутник Esri. Библиотека Leaflet хранится в папке `vendor/`.
- Масштаб STL, вертикальное преувеличение 0,5–8×, размер плитки 100–210 мм с учётом выступов.
- Плотность STL 0,5–8 мм, сглаживание высот (0/15/30/60/100 м).
- Автоматический подбор масштаба под лимит сетки и физический размер принтера.
- Пазловые соединения, номера деталей, план сборки, архив STL.
- Интерактивная объёмная модель с вращением, приближением и линиями границ плиток.
- Экспорт цветных карт рельефа для каждой плитки (PNG), с теневой отмывкой и примерными горизонталями.
- Печатная карта всей выбранной местности в PDF A4 или A3, с автоматической разбивкой по бумажным страницам. Масштаб бумаги задаётся отдельно (1:5000–1:200000), качество 150/300 DPI. **Печать PDF без подгонки, 100%.**

## Описание данных

Реальные высоты: Mapzen Terrarium DEM, адрес `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/`. PNG-декодирование и билинейное семплирование выполняются в браузере. Плотная сетка STL не восстанавливает детали, которых нет в DEM.

Цветная карта — **изображение высот**, а не картографическая подложка дорог и зданий. Горизонтали вычисляются из DEM приблизительно. PNG-карты плиток соответствуют основному прямоугольному телу (без пазловых выступов), на бумаге следует вручную задать физический размер, указанный в `PRINT_INFO.txt`. PDF содержит точные физические размеры страниц.

## Ограничения и безопасность

- Модель создаётся квадратом, центрированным по прямоугольнику двух выбранных точек.
- Не более 196 STL-плиток и примерно 6 млн треугольников за один экспорт. Предел защищает память браузера.
- Максимум 49 цветных карт плиток за раз и 32 PDF-страницы за экспорт.
- Высота над подложкой зависит от масштаба/вертикального преувеличения и блокируется при высоте более 210 мм.
- На больших участках качество DEM зависит от уровня приближения. Веб-просмотр и экспорт требуют соединения с источниками карт и высот.
- Нет фоновой загрузки и отправки координат на собственный сервер проекта. Приложение обращается непосредственно к сторонним картографическим службам.
- Режим 3D требует WebGL. При отключённом WebGL прочие инструменты остаются доступны.
- Не использовать карту как инженерно-геодезический документ. При печати следи за габаритами своего принтера.

## Проверка

23.10.2026: Microsoft Edge на HOME-PC. Выполнен экспорт STL из реальных высот и демонстрационных данных, архивы открываются. Проверено: STL 184×184×24,8 мм, замкнутая сетка, PDF A4 с MediaBox 210×297 мм, PNG-карта плитки, парсинг координат Google/Yandex/OSM, локальная карта Leaflet. Интерфейс версии 1.2 проверяется отдельно от исходной версии 1.1.

## Исходный код

- `terrain.js` — планирование участка, Terrarium, STL и ZIP.
- `enhancements.js` — ввод координат, карты, масштаб, управление.
- `preview.js` — WebGL 3D.
- `maps-print.js` — раскраски PNG и печатные PDF.
- `vendor/` — Leaflet 1.9.4, лицензия BSD-2-Clause.
