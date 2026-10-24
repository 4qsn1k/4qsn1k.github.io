/* In-app help for both mobile and desktop users. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const panel=$('helpPanel'),btn=$('helpToggle'),close=$('helpClose');
btn.addEventListener('click',()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));});
close.addEventListener('click',()=>{panel.hidden=true;btn.setAttribute('aria-expanded','false');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.hidden=true;btn.setAttribute('aria-expanded','false');}});
const points=$('clear');
points.addEventListener('click',()=>{
 if(window.TerrainGridEditor?.getState()?.active)window.TerrainGridEditor.disable();
 window.terrainPuzzleDebug.say('Режим двух точек: отметь на карте два противоположных угла квадрата. Чтобы вернуться к перетаскиванию, включи редактор сетки.','good');
});
for(const [id,explain] of Object.entries({
 gridCount:'Число квадратов по горизонтали и вертикали. 2×2 = 4 детали.',
 tile_size:'Максимальный размер одной детали, включая выступы пазловых соединений.',
 gridToggle:'Включить или отключить прямое перетаскивание квадратной сетки на карте.',
 gridFitScreen:'Растянуть квадратную сетку до размеров видимого участка карты.',
 autoScale:'Подобрать масштаб модели под количество плиток и плотность STL.',
 printerLimit:'Полезный размер печатного стола с запасом для прилипания пластика.',
 scale:'Горизонтальный масштаб 1:N; запрещённые варианты отключены.',
 mesh_step:'Шаг 3D-сетки. Меньше шаг — плавнее модель, но выше нагрузка.',
 smooth_m:'Сглаживание высот в метрах. Уменьшает мелкие и резкие детали.',
 paper_format:'Физический размер бумаги. A0 = 841×1189 мм.',
 paper_dpi:'Растровое разрешение печатного файла. 300 DPI — стандарт для типографии.',
 paper_orientation:'Книжный или альбомный лист, авто выбирает меньшую разбивку.',
 paper_scale:'Географический масштаб бумажной карты (отличается от STL).',
 go:'Экспорт STL, опциональных 3MF, сборочного плана и маршрута в ZIP.',
 export3mf:'Цветные области высот и загруженные контуры OSM. В слайсере назначь материалы.',
 loadOSM:'Получить лес, реки, воду, дороги и отдельные деревья по выбранной рамке OSM.',
 importOSM:'Импортировать GeoJSON или .osm XML после экспорта из OpenStreetMap.',
 forestSpacing:'Шаг между условными миниатюрными деревьями в миллиметрах макета.',
 forestExport:'Добавить в ZIP отдельные STL миниатюрных деревьев для печати и приклеивания.',
 exportPaperMap:'Высококачественный PDF-карта с правильными размерами страницы.'
})){$(id)?.setAttribute('title',explain);}
})();
