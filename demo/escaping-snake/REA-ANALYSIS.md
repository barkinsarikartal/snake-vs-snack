# REA ile ön inceleme: betamos/Snake-JS

**Araç:** REA 6.8.0, `rea analyze-javascript-application <dizin> --format json`
(statik JavaScript analizi; MCP sunucusu bu oturumda bağlı olmadığı için
REA'nın terminal komutu kullanıldı). Çıktı: `JavaScriptSemanticRelationGraph`,
1814 düğüm / 1823 ilişki, 54 fonksiyon, 5 zamanlayıcı düğümü, `snake-js.js`
tamamen ayrıştırıldı (`parse_failures = 0`). Satır numaraları REA'nın
değişiklik öncesi orijinal `snake-js.js` için verdiği konumlardır.

REA'nın bildirdiği sınırlamalar: kod çalıştırılmadı (yalnızca sözdizimi);
`example.html` içindeki satır içi script analiz edilmedi; `with (constants)`
blokları ve dinamik ifadeler nedeniyle bazı özellik değerleri "unknown"
olarak işaretlendi. Aşağıdaki fonksiyon adları, satır aralıkları, çağrı
ilişkileri ve zamanlayıcılar doğrudan REA grafından; davranış açıklamaları
kaynağın okunmasıyla doğrulandı.

## 1. Oyun döngüsü ve hareket zamanlaması
- `Engine` (L81–354) oyun modelini tutar; `SnakeJS` (L15–842) dış sarmalayıcı.
- Döngü `nextFrame` (L173–207). REA `schedules-timer` ilişkileri:
  - `startMoving` (L165–170) → `setInterval(nextFrame, config.frameInterval)` (L167)
  - `resumeGame` (L123–128) → `setInterval` (L125)
  - `gameOver` (L139–163) → `setTimeout` (L162); `removeTail` (L144–152) → `setTimeout` (L148, L151)
- `frameInterval` varsayılanı 150 ms (`defaultConfig`, L23). Kare başına yılan 1 hücre ilerler.
- Durumlar: `STATE_READY/PAUSED/PLAYING/GAME_OVER` (L44–47); `pauseGame` (L116–121) `clearInterval` ile durdurur.

## 2. Yılanın konumunun tutulduğu veri yapısı
- `Snake` (L371–394): `this.points` dizisi, `points[0]` baş; `direction`, `growthLeft`, `alive`.
- `Point` (L402–413): `{left, top}` + `collidesWith(otherPoint)`.
- `moveSnake` (L219–244): `points.unshift(newHead)`; büyüme yoksa `points.pop()`.
  REA `writes-property`: L235 `direction`, L239 `growthLeft`.
- `Grid` (L361–364): `width`, `height` (varsayılan 30×20, L21–22).

## 3. Yemin oluşturulması ve konumu
- `Candy` (L421–467): `point`, `type`, `score`, `calories`, `radius`, `color`; `age()` (L455) küçülen tipi zamanla yok eder.
- `randomCandy` (L252–266): `randomPoint` (L348–353) ile rastgele hücre, `snake.collidesWith` ile boşluk kontrolü (do/while, L254–256), ardından tip seçimi (%75 normal, %20 büyük, %5 küçülen). REA `calls`: L255 → `randomPoint`, L265 → `Candy`.
- Yem `candy` bağlamasında tutulur (L84); `writes`: L108 (`initGame`), L198 ve L203 (`nextFrame`).

## 4. Yem yeme, büyüme, skor ve çarpışma
- `nextFrame` sırası: `moveSnake` (L176) → `candy.age()` (L196) → `candy.point.collidesWith(snake.points[0])` (L201) → `eatCandy` (L202) → `randomCandy` (L203) → `drawCurrentScene` (L206).
- `eatCandy` (L246–250): `score += candy.score`, `highScore`, `snake.growthLeft += candy.calories`.
- Çarpışma: `Snake.collidesWith(point, simulateMovement)` (L382–393); duvarlar `shiftPointIntoGrid` (L310–314) ile sarılır (duvar ölümü yok). `collisionTolerance` (L32) kadar kare tolerans, sonra `gameOver` (L188).

## 5. Klavye girdilerinin işlenmesi
- `InputInterface` (L761–837): `startListening` (L776–784) `window` üzerine `keydown`, `keypress`, `blur`, `focus` dinleyicileri ekler.
- `handleKeyDown` (L801–806) → `handleArrowKeyPress` (L815–836): `keyCode` 37/38/39/40 → `lastDirection`; `preventDefault` ile sayfa kaymasını engeller; `autoPlayFn` (= `startMoving`) ile oyunu başlatır.
- `nextFrame` her karede `inputInterface.lastDirection()` okur (L176); `actualDirection` (L270–282) ters yönü yok sayar.

## Değişiklik için seçilen noktalar
- Kaçış mantığı `nextFrame` içine, yem yeme kontrolünden sonra eklendi (ayrı zamanlayıcı yok).
- `randomCandy` boş hücre listesiyle yeniden yazıldı (dolu tahta → kazanma).
- `InputInterface.handleKeyDown` WASD ve `event.key` ile genişletildi.
- `gameOver` zamanlayıcıları izlenerek `destroy()` ile temizlenebilir hale getirildi.
