<script setup>
import { TresCanvas } from '@tresjs/core'
import ScannerScene from './ScannerScene.vue'
</script>

<template>
  <!-- Полноэкранный Scanner [REDACTED] -->
  <div class="scanner-root">
    <TresCanvas clear-color="#00050d">
      <ScannerScene />
    </TresCanvas>
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
}
</style>
