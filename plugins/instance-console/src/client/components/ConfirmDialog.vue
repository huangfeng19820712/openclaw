<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  requireInput?: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const inputValue = ref('');

watch(() => props.show, () => {
  inputValue.value = '';
});

function handleConfirm(): void {
  if (props.requireInput && inputValue.value !== props.requireInput) {
    return;
  }
  emit('confirm');
}

function handleCancel(): void {
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="handleCancel"
    >
      <div class="bg-card-dark rounded-xl p-6 w-full max-w-md border border-slate-600">
        <h3 class="text-lg font-semibold mb-4">{{ title }}</h3>
        <p class="text-slate-400 mb-4">{{ message }}</p>

        <div v-if="requireInput" class="mb-4">
          <label class="block text-sm text-slate-400 mb-2">
            请输入 <code class="text-primary">{{ requireInput }}</code> 确认：
          </label>
          <input
            v-model="inputValue"
            type="text"
            class="w-full"
            :placeholder="requireInput"
          />
        </div>

        <div class="flex gap-3 justify-end">
          <button @click="handleCancel" class="btn btn-secondary">
            {{ cancelText || '取消' }}
          </button>
          <button
            @click="handleConfirm"
            :class="['btn', danger ? 'btn-danger' : 'btn-primary']"
            :disabled="requireInput && inputValue !== requireInput"
          >
            {{ confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
