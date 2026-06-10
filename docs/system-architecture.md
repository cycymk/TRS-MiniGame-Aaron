# Space Hacking Minigame 系統架構圖

本文件整理目前專案的整體架構。專案是一個無後端、無打包步驟的靜態 ESM 瀏覽器遊戲，由 `index.html` 掛載畫面與 HUD，`src/game.js` 負責執行期整合，`src/gameLogic.js` 負責可測的純遊戲規則。

## 1. 系統資訊圖

```mermaid
flowchart TB
  Player["玩家<br/>鍵盤 / 指標 / 觸控"] --> Input["輸入轉譯層<br/>mapFlightInput / mapHackInput<br/>pointerdown handlers"]

  subgraph Browser["瀏覽器 Runtime"]
    HTML["index.html<br/>Canvas + HUD + Overlay DOM"]
    CSS["src/styles.css<br/>16:9 shell / responsive HUD / touch zones"]
    Assets["public/assets + game-*.png<br/>背景、戰機、Boss、參考圖"]
  end

  subgraph Orchestrator["src/game.js 整合層"]
    State["單一 game 狀態物件<br/>mode / hp / ammo / bossHp / shield / hack"]
    Loop["requestAnimationFrame(update)<br/>時間、狀態、HUD、繪製"]
    Events["事件綁定<br/>開始、移動、開火、換武器、Hack、暫停、重開"]
    Canvas["Canvas Renderer<br/>space / tunnel / boss / ship / beams / shots"]
    DomHud["DOM HUD Renderer<br/>血量、彈藥、Boss 盾、Hack grid、toast"]
  end

  subgraph PureLogic["src/gameLogic.js 純規則層"]
    HackRules["Hack board rules<br/>6x6 grid / route / boost / trap / timer"]
    CombatRules["Combat rules<br/>player damage / shielded boss damage"]
    InputRules["Input mapping rules<br/>keyboard to game actions"]
  end

  subgraph Tests["tests"]
    Unit["gameLogic.test.js<br/>純邏輯單元測試"]
    E2E["pauseHelp.test.js<br/>Playwright 靜態伺服器 + UI 流程"]
  end

  HTML --> Orchestrator
  CSS --> HTML
  Assets --> HTML
  Assets --> Canvas
  Input --> Events
  Events --> State
  Events --> PureLogic
  Loop --> State
  Loop --> PureLogic
  Loop --> Canvas
  Loop --> DomHud
  PureLogic --> State
  Unit --> PureLogic
  E2E --> Browser
  E2E --> Orchestrator
```

## 2. 架構心智圖

```mermaid
mindmap
  root((Space Hacking Minigame))
    Runtime
      Static ESM app
        index.html
        src/game.js
        src/styles.css
      Browser APIs
        Canvas 2D
        DOM events
        requestAnimationFrame
        performance.now
    Game State
      Player
        hp
        lives
        ammo
        lane and laneTarget
        selectedWeapon
      Boss
        bossHp
        bossShieldHp
        bossMode
        bossBreakUntil
        bossDefeated
      Session
        mode
        paused
        promptAction
        messageUntil
    Gameplay Systems
      Flight
        lane movement
        weapon fire
        ammo regeneration
      Hack
        random 6x6 board
        cursor path
        boost collection
        success creates shield break window
        failure damages player
      Boss Combat
        normal
        charging
        beam
        cooldown
        defeated
      Rendering
        background space
        warp tunnel
        player ship
        boss shield and beam
        projectiles and explosions
    UI
      HUD panels
      pause modal
      start overlay
      restart overlay
      touch zones
      weapon dock
    Verification
      node:test pure rules
      Playwright pause modal
      static HTTP test server
```

## 3. 檔案與責任分層

| Layer | File | Responsibility |
| --- | --- | --- |
| Entry shell | `index.html` | 定義 Canvas、HUD、控制按鈕、Hack panel、暫停與重開 overlay，並以 ESM 載入 `src/game.js`。 |
| Runtime orchestration | `src/game.js` | 持有 `game` 狀態、事件綁定、主迴圈、DOM/HUD 更新、Canvas 繪製、Boss/玩家狀態流程。 |
| Pure domain rules | `src/gameLogic.js` | 提供 Hack 棋盤、游標移動、計時、傷害計算、盾牌吸收、輸入映射等可單元測試規則。 |
| Presentation | `src/styles.css` | 建立 16:9 遊戲容器、HUD 版面、按鈕、觸控區、暫停面板與響應式配置。 |
| Media | `public/assets/*`, `game-*.png` | 遊戲中的飛船、Boss、背景與設計參考素材。 |
| Test harness | `tests/gameLogic.test.js` | 驗證純規則層的棋盤、傷害、輸入映射與隨機 Hack route。 |
| Browser test | `tests/pauseHelp.test.js` | 啟動本地靜態伺服器，用 Playwright 驗證暫停說明與 Hack 倒數暫停。 |

## 4. 遊戲狀態流程圖

```mermaid
stateDiagram-v2
  [*] --> title: resetGame(startMode = title)
  title --> intro: startOverlay pointerdown
  intro --> flight: intro animation complete

  flight --> hack: hack input
  hack --> flight: cancelHack
  hack --> flight: resolveHack(success)
  hack --> flight: resolveHack(failed)

  flight --> playerDestroyed: hp reaches 0
  hack --> playerDestroyed: failed hack or beam damage drops hp to 0
  playerDestroyed --> continue: lives remain
  playerDestroyed --> gameover: lives exhausted
  continue --> intro: restart overlay pointerdown
  gameover --> intro: retry pointerdown

  flight --> bossDying: bossHp reaches 0
  hack --> bossDying: bossHp reaches 0 after damage resolution
  bossDying --> victory: defeat sequence complete
  victory --> victoryPrompt: prompt delay complete
  victoryPrompt --> intro: bossRestart prompt pointerdown

  flight --> flight: pause toggles game.paused
  hack --> hack: pause freezes hack expiresAt and timers
```

## 5. Runtime 主迴圈

```mermaid
flowchart TD
  RAF["requestAnimationFrame(update)"] --> Paused{"game.paused?"}
  Paused -- yes --> KeepTime["lastTime = now<br/>schedule next frame"]
  KeepTime --> RAF

  Paused -- no --> Delta["clamp delta <= 48ms<br/>advance travel / speedPulse"]
  Delta --> PhaseUpdates["updateIntro<br/>updatePlayerDestroyed<br/>updateBossVictory<br/>updateBossBreak<br/>updateBoss"]
  PhaseUpdates --> Mode{"game.mode"}

  Mode -- flight --> Flight["regen ammo<br/>spring lane movement"]
  Mode -- hack --> HackTimer["updateHackTimer<br/>update timerValue<br/>resolve failed timeout"]
  Mode -- other --> Passive["visual/state-only updates"]

  Flight --> Toast["hide expired toast"]
  HackTimer --> Toast
  Passive --> Toast
  Toast --> Draw["draw canvas scene"]
  Draw --> Hud["updateHud DOM meters"]
  Hud --> RAF
```

## 6. 輸入到動作資料流

```mermaid
flowchart LR
  subgraph Inputs["Input Sources"]
    Keyboard["window keydown"]
    Buttons["HUD buttons"]
    Touch["mobile touch zones"]
    Overlay["start / pause / restart overlays"]
  end

  Keyboard --> FlightMap["mapFlightInput"]
  Keyboard --> HackMap["mapHackInput"]
  Buttons --> PointerHandlers["pointerdown handlers"]
  Touch --> PointerHandlers
  Overlay --> OverlayHandlers["overlay handlers"]

  FlightMap --> ActionRouter{"mode?"}
  HackMap --> ActionRouter
  PointerHandlers --> ActionRouter
  OverlayHandlers --> StateTransitions["startIntro / setPaused / continuePlayer / resetGame"]

  ActionRouter -- flight --> FlightActions["moveFlight / fireWeapon / cycleWeapon / enterHack"]
  ActionRouter -- hack --> HackActions["moveHack / cancelHack"]
  ActionRouter -- paused --> Ignore["ignore gameplay input"]

  FlightActions --> GameState["game state"]
  HackActions --> GameState
  StateTransitions --> GameState
```

## 7. Hack 子系統流程

```mermaid
sequenceDiagram
  participant User as 玩家
  participant Game as src/game.js
  participant Logic as src/gameLogic.js
  participant HUD as Hack DOM / Timer
  participant Boss as Boss Shield Window

  User->>Game: hack input
  Game->>Logic: createRandomHackBoard()
  Game->>Logic: createInitialHackState({ board, now })
  Logic-->>Game: hack state with cursor/path/expiresAt
  Game->>HUD: renderHackGrid()

  loop 每次方向輸入
    User->>Game: 8 / 2 / 4 / 6 or arrows
    Game->>Logic: moveHackCursor(state, direction)
    Logic-->>Game: next state
    Game->>HUD: renderHackGrid()
  end

  alt reaches core
    Game->>Logic: resolveHackBreakDuration(boostsCollected)
    Logic-->>Game: 4000ms + 1000ms per boost
    Game->>Boss: set bossBreakUntil
    Game->>HUD: show success / refill ammo
  else touches trap or timer expires
    Game->>Logic: applyPlayerDamage({ damage: HACK_FAIL_DAMAGE })
    Logic-->>Game: hp/lives/outcome
    Game->>HUD: show failure
  end
```

## 8. 戰鬥與 Boss 盾牌流程

```mermaid
flowchart TD
  Fire["fireWeapon"] --> Weapon{"selectedWeapon"}
  Weapon --> Machine["machine<br/>cost 3 / cooldown 90 / damage 1"]
  Weapon --> Spread["spread<br/>cost 9 / cooldown 260 / damage 6"]
  Weapon --> Laser["laser<br/>cost 24 / cooldown 780 / damage 16"]

  Machine --> DamageProfile{"boss break active?"}
  Spread --> DamageProfile
  Laser --> DamageProfile

  DamageProfile -- no --> Normal["normal profile<br/>shield 8% / hull 2% / cancel 90%"]
  DamageProfile -- yes --> Break["break profile<br/>shield 70% / hull 10% / cancel 20%"]

  Normal --> ShieldCalc["applyShieldedBossDamage"]
  Break --> ShieldCalc
  ShieldCalc --> UpdateBoss["update bossHp / bossShieldHp"]
  UpdateBoss --> Impact["recordShieldImpact<br/>shots / blasts visual queues"]
  UpdateBoss --> Defeated{"bossHp <= 0?"}
  Defeated -- yes --> BossDying["defeatBoss -> bossDying -> victory"]
  Defeated -- no --> Continue["continue fight"]

  BossModes["Boss mode timer"] --> NormalMode["normal"]
  NormalMode --> Charging["charging"]
  Charging --> Beam["beam<br/>applyPlayerDamage(18) once"]
  Beam --> Cooldown["cooldown<br/>weak point exposed"]
  Cooldown --> NormalMode
```

## 9. 暫停與時間補償流程

```mermaid
flowchart TD
  Toggle["setPaused(true)"] --> Freeze["store pausedAt<br/>show pauseOverlay<br/>focus resumeButton"]
  Freeze --> Resume["setPaused(false)"]
  Resume --> Duration["pausedDuration = now - pausedAt"]
  Duration --> ShiftGameClocks["shift bossModeStartedAt<br/>lastShotAt<br/>messageUntil"]
  Duration --> ShiftHack["if hack: expiresAt += pausedDuration"]
  Duration --> ShiftVisuals["shift shots / blasts / shieldImpacts born times"]
  ShiftGameClocks --> Unfreeze["hide overlay<br/>focus pauseButton"]
  ShiftHack --> Unfreeze
  ShiftVisuals --> Unfreeze
```

## 10. 測試覆蓋視圖

```mermaid
flowchart LR
  subgraph PureTests["tests/gameLogic.test.js"]
    Board["board shape / cursor start"]
    Movement["movement / block / bounds"]
    HackResult["trap failure / core success / boost count / timeout"]
    Damage["player damage / boss shield split"]
    InputMap["keyboard mappings"]
    RandomBoard["random board has valid route"]
  end

  subgraph BrowserTests["tests/pauseHelp.test.js"]
    StaticServer["local static server"]
    Playwright["Chromium / system browser fallback"]
    PauseHelp["pause modal opens with help"]
    FrozenTimer["hack countdown freezes while paused"]
  end

  PureTests --> Logic["src/gameLogic.js"]
  BrowserTests --> UI["index.html + src/game.js + src/styles.css"]
```

## 11. 架構觀察

- 目前架構是「靜態頁面 + 單檔 runtime orchestrator + 純邏輯模組」；沒有後端、資料庫、路由器或打包管線。
- `src/gameLogic.js` 的設計已經把高風險規則抽成純函式，測試成本低，是後續擴充 Hack board、Boss damage profile、輸入映射時最穩的切入點。
- `src/game.js` 同時承擔狀態機、事件、Canvas 繪製、HUD 更新與音效/提示節奏，是目前最大的耦合點；若遊戲繼續變大，最自然的下一步是把 `rendering`、`boss system`、`input system`、`hud system` 拆成模組。
- 暫停流程不是單純停止畫面，而是補償所有依賴 `performance.now()` 的時間戳，這是 Hack 倒數、Boss 節奏與子彈特效能同步恢復的關鍵。
