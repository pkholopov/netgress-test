<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import ScannerScene from './ScannerScene.vue'

// --- Фракция ---
const FACTION_COLORS = { ENL: '#00ff00', RES: '#00a8ff' }
const faction = ref(null) // null до выбора, затем 'ENL' | 'RES'
const factionColor = computed(() => FACTION_COLORS[faction.value] || '#aaaaaa')

// --- Состояние мира ---
const MAP_LIMIT = 22 // Границы игрового участка
const ACTION_RANGE = 4.5 // Радиус действия агента у портала
const LINK_RANGE = 18 // Максимальная дальность линка
const RESONATOR_SLOTS = 8

const portals = ref([
  { id: 'A', name: 'PORTAL-ALPHA', position: [0, 0, 0], hacked: false, resonators: 0 },
  { id: 'B', name: 'PORTAL-BRAVO', position: [10, 0, -6], hacked: false, resonators: 0 },
  { id: 'C', name: 'PORTAL-CHARLIE', position: [-2, 0, -14], hacked: false, resonators: 0 },
])
const links = ref([]) // Пары id порталов
const field = ref(null) // Позиции вершин поля, когда треугольник замкнут

const player = reactive({ x: 0, z: 7, heading: 0 })
const keys = reactive({ up: false, down: false, left: false, right: false })
const xm = ref(0) // Exotic Matter агента

const chooseFaction = (f) => {
  faction.value = f
  xm.value = 2500
}

// --- Геометрия мира ---
const dist = (p) => {
  return Math.hypot(player.x - p.position[0], player.z - p.position[2])
}
const portalById = (id) => {
  return portals.value.find((p) => {
    return p.id === id
  })
}
const hasLink = (a, b) =>
  links.value.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

const nearPortal = computed(() => {
  return portals.value.find((p) => {
    return dist(p) <= ACTION_RANGE
  }) || null
})

// Первая недостающая пара линков
const neededLink = computed(() => {
  const ids = portals.value.map((p) => {
    return p.id
  })
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!hasLink(ids[i], ids[j])) {
        return [ids[i], ids[j]]
      }
    }
  }
  return null
})

// Цель линка. Правило оригинала: у ОБОИХ порталов должны быть заполнены все 8 слотов
const linkTarget = computed(() => {
  if (!neededLink.value) {
    return null
  }
  const near = nearPortal.value
  if (!near || !near.hacked || near.resonators < RESONATOR_SLOTS) {
    return null
  }
  const [a, b] = neededLink.value
  if (near.id !== a && near.id !== b) {
    return null
  }
  const target = portalById(near.id === a ? b : a)
  if (!target.hacked || target.resonators < RESONATOR_SLOTS || dist(target) > LINK_RANGE) {
    return null
  }
  return target
})

// --- Руководство туториала ---
const objective = computed(() => {
  for (const p of portals.value) {
    if (!p.hacked) {
      return { type: 'hack', portal: p }
    }
    if (p.resonators < RESONATOR_SLOTS) {
      return { type: 'deploy', portal: p }
    }
  }
  if (neededLink.value) {
    const [a, b] = neededLink.value.map((id) => {
      return portalById(id)
    })
    return { type: 'link', portal: dist(a) <= dist(b) ? a : b }
  }
  return null
})

const currentStepText = computed(() => {
  const obj = objective.value
  if (!obj) {
    return 'CONTROL FIELD установлен! Сектор под контролем. Модуль обучения пройден.'
  }
  const isNear = nearPortal.value?.id === obj.portal.id
  if (obj.type === 'hack') {
    return isNear
      ? `Вы у ${obj.portal.name}. Взломайте портал: получите XM и ключ доступа.`
      : `Двигайтесь к ${obj.portal.name}: стрелки / WASD или D-pad внизу.`
  }
  if (obj.type === 'deploy') {
    if (obj.portal.resonators === 0) {
      return isNear
        ? `Портал взломан, но остаётся нейтральным. Первый резонатор захватит его под цвет фракции. Нажмите DEPLOY (${obj.portal.resonators}/${RESONATOR_SLOTS}).`
        : `Двигайтесь к ${obj.portal.name} для установки резонаторов.`
    }
    return isNear
      ? `Разверните резонаторы (${obj.portal.resonators}/${RESONATOR_SLOTS}). Правило оригинала: линк нельзя создать, пока у портала не заполнены все 8 слотов!`
      : `Двигайтесь к ${obj.portal.name} для установки резонаторов.`
  }
  return isNear
    ? `Линк требует 8/8 резонаторов на ОБОИХ порталах. Создайте линк ${obj.portal.name} → ${linkTarget.value?.name ?? 'союзный портал'}: замкнётся треугольник поля.`
    : `Двигайтесь к ${obj.portal.name} — он должен войти в треугольник линков.`
})

// --- Действия ---

// Временное уведомление в HUD (как лог Comm в оригинале)
const notice = ref(null)
let noticeTimer = null
const showNotice = (msg) => {
  notice.value = msg
  if (noticeTimer) {
    clearTimeout(noticeTimer)
  }
  noticeTimer = setTimeout(() => {
    notice.value = null
  }, 4000)
}

const actionHack = () => {
  const near = nearPortal.value
  if (!near || near.hacked) {
    return
  }
  near.hacked = true
  xm.value += 1000
  // Хак даёт инвентарь и ключ, но НЕ захватывает портал
  showNotice(`HACK OK: ${near.name} · +1000 XM · ключ портала получен`)
}

const actionDeploy = () => {
  const near = nearPortal.value
  if (!near || !near.hacked || near.resonators >= RESONATOR_SLOTS || xm.value < 50) {
    return
  }
  near.resonators++
  xm.value -= 50
  if (near.resonators === 1) {
    showNotice(`DEPLOY OK: ${near.name} · портал захвачен под цвет фракции`)
  }
}

const actionLink = () => {
  const near = nearPortal.value
  const target = linkTarget.value
  if (!near || !target || xm.value < 250) {
    return
  }
  links.value.push([near.id, target.id])
  xm.value -= 250
  // Замкнулся треугольник — создаём Control Field
  if (!neededLink.value) {
    field.value = portals.value.map((p) => {
      return p.position
    })
  }
}

// Ключи порталов в инвентаре агента
const keyCount = computed(() => {
  return portals.value.filter((p) => {
    return p.hacked
  }).length
})

// --- Движение агента ---
const clamp = (v) => {
  return Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, v))
}

const onMove = ({ mx, mz, delta }) => {
  const len = Math.hypot(mx, mz)
  if (!len) {
    return
  }
  const speed = 6 * delta
  player.x = clamp(player.x + (mx / len) * speed)
  player.z = clamp(player.z + (mz / len) * speed)
  player.heading = Math.atan2(mx / len, mz / len)
}

const keyMap = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}
const onKeyDown = (e) => {
  const k = keyMap[e.code]
  if (k) {
    keys[k] = true
    e.preventDefault()
  }
}
const onKeyUp = (e) => {
  const k = keyMap[e.code]
  if (k) {
    keys[k] = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

const xmPercent = computed(() => {
  return Math.min(100, (xm.value / 5000) * 100)
})
</script>

<template>
  <!-- Полноэкранный Scanner [REDACTED] -->
  <div class="scanner-root">
    <TresCanvas clear-color="#00050d">
      <ScannerScene
        :portals="portals"
        :links="links"
        :field="field"
        :player="player"
        :keys="keys"
        :faction-color="factionColor"
        @hack="actionHack"
        @move="onMove"
      />
    </TresCanvas>

    <!-- Выбор фракции — DOM-оверлей поверх canvas, строго по центру -->
    <div v-if="!faction" class="overlay-center">
      <div class="panel faction-panel">
        <div class="panel-title">ВЫБЕРИТЕ ФРАКЦИЮ</div>
        <div class="faction-row">
          <button class="fac-btn enl" @click="chooseFaction('ENL')">
            <strong>ENLIGHTENED</strong>
            <span>Просвещённые</span>
          </button>
          <button class="fac-btn res" @click="chooseFaction('RES')">
            <strong>RESISTANCE</strong>
            <span>Сопротивление</span>
          </button>
        </div>
      </div>
    </div>

    <!-- HUD сканера — DOM-оверлей, прижат к низу, всегда внутри экрана -->
    <div v-else class="hud" :style="{ '--fac': factionColor }">
      <!-- Уведомление о событиях: хак, ключи, захват -->
      <Transition name="notice">
        <div v-if="notice" class="notice">{{ notice }}</div>
      </Transition>

      <div class="hud-row">
        <span class="keys-tag">KEYS: {{ keyCount }}</span>
        <span class="xm-label">XM</span>
        <div class="xm-bar">
          <div class="xm-fill" :style="{ width: `${xmPercent}%` }"></div>
        </div>
        <span class="portal-tag">{{ nearPortal ? nearPortal.name : '—' }}</span>
      </div>

      <div class="instruction">{{ currentStepText }}</div>

      <div class="controls">
        <div class="dpad">
          <button
            class="dp up"
            @pointerdown.prevent="keys.up = true"
            @pointerup="keys.up = false"
            @pointerleave="keys.up = false"
            @pointercancel="keys.up = false"
          >
            ▲
          </button>
          <button
            class="dp left"
            @pointerdown.prevent="keys.left = true"
            @pointerup="keys.left = false"
            @pointerleave="keys.left = false"
            @pointercancel="keys.left = false"
          >
            ◀
          </button>
          <button
            class="dp down"
            @pointerdown.prevent="keys.down = true"
            @pointerup="keys.down = false"
            @pointerleave="keys.down = false"
            @pointercancel="keys.down = false"
          >
            ▼
          </button>
          <button
            class="dp right"
            @pointerdown.prevent="keys.right = true"
            @pointerup="keys.right = false"
            @pointerleave="keys.right = false"
            @pointercancel="keys.right = false"
          >
            ▶
          </button>
        </div>

        <div class="actions">
          <button v-if="nearPortal && !nearPortal.hacked" class="ing-btn" @click="actionHack">
            HACK
          </button>
          <button
            v-if="nearPortal && nearPortal.hacked && nearPortal.resonators < RESONATOR_SLOTS"
            class="ing-btn"
            @click="actionDeploy"
          >
            DEPLOY
          </button>
          <button v-if="linkTarget" class="ing-btn" @click="actionLink">
            LINK → {{ linkTarget.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scanner-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: #00050d;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
}

/* Центрирующий контейнер для панели фракций */
.overlay-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.panel {
  color: var(--fac, #00e5ff);
  text-align: center;
  pointer-events: auto;
}

.hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  background: rgba(0, 5, 13, 0.85);
  border-top: 1px solid var(--fac, #00a8ff);
  box-shadow: 0 0 15px rgba(0, 168, 255, 0.15);
  padding: 10px 14px;
  box-sizing: border-box;
  user-select: none;
  color: var(--fac, #00e5ff);
  z-index: 10;
  max-height: 60vh;
  overflow-y: auto;
}

.panel-title {
  font-size: 18px;
  letter-spacing: 3px;
  text-shadow: 0 0 8px currentColor;
  margin-bottom: 14px;
}

.faction-panel {
  width: 480px;
  max-width: 92vw;
  background: rgba(0, 5, 13, 0.92);
  border: 1px solid #00a8ff;
  box-shadow: 0 0 25px rgba(0, 168, 255, 0.3);
  padding: 22px;
  box-sizing: border-box;
}

.faction-row {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.fac-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 15px;
  letter-spacing: 1px;
  background: transparent;
  transition:
    background 0.2s,
    color 0.2s,
    box-shadow 0.2s;
}

.fac-btn span {
  font-size: 11px;
  opacity: 0.7;
  text-transform: none;
  letter-spacing: 0;
}

.fac-btn.enl {
  border: 1px solid #00ff00;
  color: #00ff00;
}

.fac-btn.enl:hover {
  background: #00ff00;
  color: #000;
  box-shadow: 0 0 20px #00ff00;
}

.fac-btn.res {
  border: 1px solid #00a8ff;
  color: #00a8ff;
}

.fac-btn.res:hover {
  background: #00a8ff;
  color: #000;
  box-shadow: 0 0 20px #00a8ff;
}

.hud-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.keys-tag {
  font-size: 12px;
  color: var(--fac);
  flex: none;
  width: 70px;
  text-align: left;
}

.xm-label {
  font-size: 12px;
  color: #00e5ff;
  text-shadow: 0 0 5px #00e5ff;
}

.xm-bar {
  flex: 1;
  height: 6px;
  border: 1px solid #00e5ff;
  background: rgba(0, 229, 255, 0.1);
}

.xm-fill {
  height: 100%;
  background: #00e5ff;
  box-shadow: 0 0 8px #00e5ff;
  transition: width 0.3s;
}

.portal-tag {
  font-size: 12px;
  color: var(--fac);
  /* Фиксированная ширина, чтобы появление имени не меняло размер шкалы XM */
  flex: none;
  width: 150px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--fac);
  background: rgba(0, 229, 255, 0.06);
  text-shadow: 0 0 5px currentColor;
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.2);
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.instruction {
  font-size: 13px;
  margin-bottom: 10px;
  text-shadow: 0 0 5px currentColor;
}

.controls {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.ing-btn {
  background: transparent;
  border: 1px solid var(--fac);
  color: var(--fac);
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  text-transform: uppercase;
  font-family: inherit;
  font-size: 13px;
  transition:
    background 0.2s,
    color 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 0 8px currentColor;
}

.ing-btn:hover {
  background: var(--fac);
  color: #000;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 34px);
  grid-template-rows: repeat(2, 34px);
  gap: 4px;
}

.dp {
  background: transparent;
  border: 1px solid var(--fac);
  color: var(--fac);
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

.dp:active {
  background: var(--fac);
  color: #000;
}

.dp.up {
  grid-column: 2;
  grid-row: 1;
}

.dp.left {
  grid-column: 1;
  grid-row: 2;
}

.dp.down {
  grid-column: 2;
  grid-row: 2;
}

.dp.right {
  grid-column: 3;
  grid-row: 2;
}

/* Мобильная раскладка: компактный HUD, элементы не вылезают за экран */
@media (max-width: 560px), (max-height: 520px) {
  .hud {
    padding: 8px 10px;
  }
  .instruction {
    font-size: 11px;
    margin-bottom: 8px;
  }
  .controls {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .actions {
    order: -1;
    width: 100%;
  }
  .ing-btn {
    padding: 10px 14px;
    font-size: 12px;
  }
  .dpad {
    grid-template-columns: repeat(3, 42px);
    grid-template-rows: repeat(2, 42px);
  }
  .dp {
    font-size: 16px;
  }
  .keys-tag {
    width: 60px;
  }
  .portal-tag {
    width: 110px;
  }
  .fac-btn {
    padding: 12px 8px;
    font-size: 13px;
  }
  .panel-title {
    font-size: 15px;
  }
}
</style>
