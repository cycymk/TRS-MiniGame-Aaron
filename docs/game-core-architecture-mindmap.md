# 遊戲核心架構心智圖

```mermaid
mindmap
  root((遊戲核心架構))
    啟動與執行環境
      index.html
        Canvas 舞台
        HUD 面板
        Overlay
        控制按鈕
      瀏覽器 API
        Canvas 2D
        DOM Event
        requestAnimationFrame
        performance.now
      靜態資源
        public/assets
        背景
        玩家戰機
        Boss 母艦
    主控核心
      src/game.js
        單一 game 狀態
        事件路由
        主迴圈 update
        Canvas 繪製
        HUD 同步
      game.mode
        title
        intro
        flight
        hack
        playerDestroyed
        continue
        gameover
        bossDying
        victory
        victoryPrompt
      時間控制
        delta clamp
        pausedAt
        messageUntil
        bossModeStartedAt
        hack expiresAt
    玩家系統
      飛行
        三航道 lane
        laneTarget
        spring movement
        speedPulse
      資源
        hp
        lives
        ammo
      武器
        machine
          低消耗
          高射速
        spread
          中消耗
          中傷害
        laser
          高消耗
          高傷害
      受傷與續關
        applyPlayerDamage
        beginPlayerDestroyed
        continuePlayer
        resetGame
    Boss 系統
      狀態節奏
        normal
        charging
        beam
        cooldown
        defeated
      生命與盾牌
        bossHp
        bossShieldHp
        shield restore
        bossBreakUntil
      攻擊
        charging countdown
        beam damage
        cooldown weak point
      受擊計算
        applyShieldedBossDamage
        normal profile
        break profile
        shieldImpact visuals
    Hack 子遊戲
      src/gameLogic.js
        createRandomHackBoard
        createInitialHackState
        moveHackCursor
        updateHackTimer
        resolveHackBreakDuration
      棋盤規則
        6x6 grid
        start
        core
        boost
        trap
        block
      成功結果
        增加 ammo
        開啟 Boss break window
        boost 延長破盾時間
      失敗結果
        trap
        timeout
        HACK_FAIL_DAMAGE
    輸入系統
      鍵盤
        mapFlightInput
        mapHackInput
      指標與觸控
        pointerdown
        hold controls
        mobile touch zones
      動作
        moveFlight
        fireWeapon
        cycleWeapon
        enterHack
        moveHack
        cancelHack
      暫停
        setPaused
        pauseOverlay
        時間戳補償
    視覺呈現
      Canvas 場景
        drawSpace
        drawWarpTunnel
        drawFlightPath
        drawBoss
        drawShip
        drawShots
        drawActiveBossBeam
      DOM HUD
        hpBar
        ammoBar
        bossBar
        bossShieldBar
        hackGrid
        toast
      特效資料
        stars
        hazards
        shots
        blasts
        shieldImpacts
    測試保護
      單元測試
        gameLogic.test.js
        Hack 規則
        傷害規則
        輸入映射
      瀏覽器測試
        pauseHelp.test.js
        Playwright
        暫停面板
        Hack 倒數凍結
```

## 核心解讀

- `src/game.js` 是遊戲執行期中樞，負責把輸入、狀態、時間、HUD 與 Canvas 畫面串起來。
- `src/gameLogic.js` 是純規則核心，處理 Hack 棋盤、傷害、盾牌與輸入映射，並由單元測試保護。
- 主要玩法閉環是：玩家飛行與開火、Boss 盾牌吸收、Hack 成功製造破盾窗口、破盾期間提高有效輸出，直到 Boss 進入 defeated/victory 流程。
