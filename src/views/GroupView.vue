<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import { longDate, timeAgo } from '@/utils/date'
import { friendlyError } from '@/utils/errors'
import { initials } from '@/utils/text'

const groupStore = useGroupStore()
const toast = useToastStore()
const router = useRouter()

// Web Share and Clipboard need a secure context (HTTPS or localhost).
const canShare = typeof navigator.share === 'function'

const membersLabel = computed(() => {
  const n = groupStore.activeMembers.length
  return n === 1 ? '1 miembro' : `${n} miembros`
})

async function share() {
  try {
    await navigator.share({
      title: `Únete a ${groupStore.group.name}`,
      text: 'Únete a nuestra lista de la compra en Compra Familiar',
      url: groupStore.inviteUrl,
    })
  } catch {
    // The user closed the share sheet.
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(groupStore.inviteUrl)
    toast.show('Enlace copiado')
  } catch {
    toast.show('No se pudo copiar: mantén pulsado el enlace')
  }
}

const leaving = ref(false)

async function leave() {
  const name = groupStore.group.name
  const lastGroup = groupStore.memberships.length === 1
  const question =
    `¿Salir de ${name}? Dejarás de ver su lista en este dispositivo. Lo que compraste seguirá en su historial.` +
    (lastGroup ? ' Es tu único grupo: volverás a la pantalla de bienvenida.' : '')
  if (!window.confirm(question)) return
  leaving.value = true
  try {
    await groupStore.leaveGroup()
    toast.show(`Has salido de ${name}`)
    await router.replace({ name: groupStore.status === 'no-group' ? 'welcome' : 'list' })
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    leaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <p class="eyebrow">Grupo</p>
      <GroupSwitcher />
      <p class="muted">{{ membersLabel }} · desde el {{ longDate(groupStore.group.createdAt) }}</p>
    </header>

    <h2 class="section-title"><span>Quién está</span></h2>
    <ul class="rows">
      <li v-for="member in groupStore.activeMembers" :key="member.id" class="member">
        <span class="avatar" :class="{ me: groupStore.isMe(member.id) }" aria-hidden="true">
          {{ initials(member.name) }}
        </span>
        <span class="text">
          <span class="name">
            {{ member.name }}
            <span v-if="groupStore.isMe(member.id)" class="you">tú, en este dispositivo</span>
          </span>
          <span class="muted since">Se unió {{ timeAgo(member.createdAt) }}</span>
        </span>
      </li>
    </ul>

    <h2 class="section-title"><span>Invitar a alguien</span></h2>
    <section class="invite">
      <p>
        Comparte este enlace con quien quieras sumar a la lista. Al abrirlo solo tendrá que escribir su nombre, sin
        registrarse.
      </p>
      <a class="link" :href="groupStore.inviteUrl" @click.prevent>{{ groupStore.inviteUrl }}</a>
      <p class="code">
        <span class="muted">Código</span>
        <strong>{{ groupStore.group.inviteCode }}</strong>
      </p>
      <div class="actions">
        <button v-if="canShare" type="button" class="btn btn-primary" @click="share">
          <AppIcon name="share" :size="20" />
          Compartir enlace
        </button>
        <button type="button" class="btn" :class="canShare ? 'btn-ghost' : 'btn-primary'" @click="copy">
          <AppIcon name="copy" :size="20" />
          Copiar enlace
        </button>
      </div>
    </section>

    <div class="leave">
      <button type="button" class="btn btn-block leave-btn" :disabled="leaving" @click="leave">
        {{ leaving ? 'Saliendo…' : 'Salir de este grupo' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.leave {
  margin-top: 32px;
  padding: 0 var(--gutter);
}

.leave-btn {
  border: 1.5px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  color: var(--warn);
  background: transparent;
}

.leave-btn:hover {
  background: var(--warn-soft);
}

.member {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 10px var(--gutter);
}

.avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
  font-size: 0.9375rem;
  flex-shrink: 0;
}

.avatar.me {
  background: var(--primary);
  color: #fff;
}

.text {
  display: grid;
}

.name {
  font-weight: 600;
  font-size: 1.0625rem;
}

.you {
  margin-left: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--qty-ink);
  background: var(--qty-soft);
  padding: 2px 8px;
  border-radius: 999px;
  vertical-align: 2px;
}

.since {
  font-size: 0.8125rem;
}

.invite {
  display: grid;
  gap: 14px;
  padding: 18px var(--gutter);
  background: var(--surface);
  border-block: 1px solid var(--line);
}

@media (min-width: 592px) {
  .invite {
    border-inline: 1px solid var(--line);
    border-radius: var(--radius);
  }
}

.link {
  display: block;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg);
  color: var(--primary);
  font-weight: 600;
  overflow-wrap: anywhere;
  text-decoration: none;
  user-select: all;
}

.code {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.code strong {
  font-size: 1.25rem;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.actions .btn {
  flex: 1 1 180px;
}
</style>
