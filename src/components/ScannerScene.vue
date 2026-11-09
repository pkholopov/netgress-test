<script setup>
import { ref, shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'

// Чистая 3D-сцена: состояние живёт в Netgress, сюда приходят пропсы и уходят события
const props = defineProps({
  portals: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  field: { type: Array, default: null },
  player: { type: Object, required: true },
  keys: { type: Object, required: true },
  factionColor: { type: String, default: '#aaaaaa' },
})

const emit = defineEmits(['hack', 'move'])

const NEUTRAL = '#aaaaaa'
const PLAYER_COLOR = '#ffcc00' // Оригинальный жёлтый маркер агента

// Сетка игрового поля (Scanner [REDACTED])
const gridHelper = shallowRef(new THREE.GridHelper(60, 60, 0x00a8ff, 0x002244))

// Стрелка агента — жёлтый chevron классического сканера (+Z при heading = 0)
const arrowGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0.05, 1.4),
  new THREE.Vector3(0.6, 0.05, -0.8),
  new THREE.Vector3(0, 0.05, -0.3),
  new THREE.Vector3(-0.6, 0.05, -0.8),
])
const arrow = shallowRef(
  new THREE.LineLoop(arrowGeo, new THREE.LineBasicMaterial({ color: PLAYER_COLOR })),
)

// Окружность вокруг стрелки — радиус равен ACTION_RANGE (зона взаимодействия)
const circlePts = []
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2
  circlePts.push(new THREE.Vector3(Math.cos(a) * 4.5, 0.05, Math.sin(a) * 4.5))
}
const circle = shallowRef(
  new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(circlePts),
    new THREE.LineBasicMaterial({ color: PLAYER_COLOR }),
  ),
)

const playerRef = ref(null)
const cameraRef = ref(null)

// Линки между порталами — линии векторного стиля; перестраиваются при смене линков и цвета фракции
const linkLines = shallowRef([])

watch(
  [() => props.links, () => props.factionColor],
  ([linksList, color]) => {
    linkLines.value.forEach((l) => {
      l.geometry.dispose()
    })
    const byId = Object.fromEntries(
      props.portals.map((p) => {
        return [p.id, p.position]
      }),
    )
    linkLines.value = linksList.map(([a, b]) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(byId[a][0], 0.1, byId[a][2]),
        new THREE.Vector3(byId[b][0], 0.1, byId[b][2]),
      ])
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
    })
  },
  { deep: true, immediate: true },
)

// Control Field — полупрозрачный треугольник над тремя порталами
const fieldMesh = shallowRef(null)

watch(
  [() => props.field, () => props.factionColor],
  ([f, color]) => {
    if (!f || f.length < 3) {
      fieldMesh.value = null
      return
    }
    const verts = new Float32Array([
      f[0][0],
      0.08,
      f[0][2],
      f[1][0],
      0.08,
      f[1][2],
      f[2][0],
      0.08,
      f[2][2],
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    fieldMesh.value = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      }),
    )
  },
  { immediate: true },
)

// В v5 useLoop предоставляет коллбек с delta, адаптированный под FPS
const { onBeforeRender } = useLoop()
const tmpTarget = new THREE.Vector3()

onBeforeRender(({ delta }) => {
  // Логика движения (кламп, скорость, heading) живёт в родителе — передаём ввод наверх
  const mx = (props.keys.right ? 1 : 0) - (props.keys.left ? 1 : 0)
  const mz = (props.keys.down ? 1 : 0) - (props.keys.up ? 1 : 0)
  if (mx !== 0 || mz !== 0) {
    emit('move', { mx, mz, delta })
  }

  // Жёлтая стрелка с окружностью следует за агентом
  if (playerRef.value) {
    playerRef.value.position.set(props.player.x, 0, props.player.z)
    playerRef.value.rotation.y = props.player.heading
  }

  // Камера сканера плавно следует за агентом
  if (cameraRef.value) {
    tmpTarget.set(props.player.x, 16, props.player.z + 13)
    cameraRef.value.position.lerp(tmpTarget, 1 - Math.exp(-delta * 3))
    cameraRef.value.lookAt(props.player.x, 0, props.player.z)
  }
})
</script>

<template>
  <!-- Камера сканера старого Ingress -->
  <TresPerspectiveCamera ref="cameraRef" :position="[0, 16, 20]" :look-at="[0, 0, 0]" :fov="60" />

  <!-- Сетка игрового поля -->
  <primitive :object="gridHelper" />

  <!-- Жёлтая стрелка и окружность агента -->
  <TresGroup ref="playerRef">
    <primitive :object="arrow" />
    <primitive :object="circle" />
  </TresGroup>

  <!-- Порталы -->
  <TresGroup v-for="portal in portals" :key="portal.id" :position="portal.position">
    <!-- Кольцо портала -->
    <TresMesh :rotation="[-Math.PI / 2, 0, 0]" @pointer-down="emit('hack')">
      <TresRingGeometry :args="[0.8, 1, 32]" />
      <TresMeshBasicMaterial
        :key="`${portal.resonators > 0}`"
        :color="portal.resonators > 0 ? factionColor : NEUTRAL"
        :side="THREE.DoubleSide"
      />
    </TresMesh>

    <!-- Вертикальный луч захваченного портала (как в оригинале — после захвата, не после хака) -->
    <TresMesh v-if="portal.resonators > 0" :position="[0, 3, 0]">
      <TresCylinderGeometry :args="[0.05, 0.05, 6, 8]" />
      <TresMeshBasicMaterial :color="factionColor" transparent :opacity="0.6" />
    </TresMesh>

    <!-- Резонаторы на орбите портала -->
    <TresMesh
      v-for="i in portal.resonators"
      :key="i"
      :position="[Math.cos(((i - 1) * Math.PI) / 4) * 2, 0.3, Math.sin(((i - 1) * Math.PI) / 4) * 2]"
    >
      <TresBoxGeometry :args="[0.3, 0.6, 0.3]" />
      <TresMeshBasicMaterial :color="factionColor" />
    </TresMesh>
  </TresGroup>

  <!-- Линки -->
  <primitive v-for="(line, i) in linkLines" :key="`link-${i}`" :object="line" />

  <!-- Control Field -->
  <primitive v-if="fieldMesh" :object="fieldMesh" />
</template>
