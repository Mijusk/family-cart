<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import GroupSwitcher from '@/components/GroupSwitcher.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import { useGroupStore } from '@/stores/group'
import { useToastStore } from '@/stores/toast'
import type { Member } from '@/types'
import { longDate, timeAgo } from '@/utils/date'
import { friendlyError } from '@/utils/errors'
import { cleanDisplayName } from '@/utils/text'

const groupStore = useGroupStore()
const toast = useToastStore()
const router = useRouter()

// Web Share and Clipboard need a secure context (HTTPS or localhost).
const canShare = typeof navigator.share === 'function'

const membersLabel = computed(() => {
  const n = groupStore.activeMembers.length
  return n === 1 ? '1 miembro' : `${n} miembros`
})

/** Runs an action with a shared busy flag; errors become a toast. */
const busy = ref<string | null>(null)
async function act(key: string, action: () => Promise<unknown>, done?: string) {
  if (busy.value) return
  busy.value = key
  try {
    await action()
    if (done) toast.show(done)
  } catch (e) {
    toast.show(friendlyError(e))
  } finally {
    busy.value = null
  }
}

// ── Requests ──────────────────────────────────────────────────

const approve = (m: Member) => act(`approve:${m.id}`, () => groupStore.approveMember(m.id), `${m.name} ya está en el grupo`)
const reject = (m: Member) => act(`reject:${m.id}`, () => groupStore.rejectMember(m.id), `Solicitud de ${m.name} rechazada`)

// ── Members ───────────────────────────────────────────────────

/** Member whose admin actions are open. */
const openMemberId = ref<string | null>(null)
/** Claim code just generated, shown under that member. */
const claimCodes = ref<Record<string, string>>({})

function toggleMember(m: Member) {
  if (!groupStore.isAdmin || groupStore.isMe(m.id)) return
  openMemberId.value = openMemberId.value === m.id ? null : m.id
}

const makeAdmin = (m: Member) =>
  act(`role:${m.id}`, () => groupStore.setMemberRole(m.id, 'admin'), `${m.name} ahora es administrador`)
const removeAdmin = (m: Member) =>
  act(`role:${m.id}`, () => groupStore.setMemberRole(m.id, 'member'), `${m.name} ya no es administrador`)

function removeMember(m: Member) {
  if (!window.confirm(`¿Quitar a ${m.name} del grupo? Lo que compró seguirá en el historial.`)) return
  void act(`remove:${m.id}`, async () => {
    await groupStore.removeMember(m.id)
    openMemberId.value = null
  }, `${m.name} ya no está en el grupo`)
}

const makeClaimCode = (m: Member) =>
  act(`claim:${m.id}`, async () => {
    claimCodes.value[m.id] = await groupStore.createClaimCode(m.personId)
  })

// ── Profiles without an account ───────────────────────────────

const addingProfile = ref(false)
const profileName = ref('')

function addProfile() {
  const name = cleanDisplayName(profileName.value)
  if (!name) return
  void act('profile', async () => {
    await groupStore.createProfile(name)
    profileName.value = ''
    addingProfile.value = false
  }, `${name} ya está en el grupo`)
}

// ── Invite ────────────────────────────────────────────────────

async function share() {
  try {
    await navigator.share({
      title: `Únete a ${groupStore.group.name}`,
      text: `Únete a ${groupStore.group.name} en Compra Familiar`,
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

function regenerate() {
  if (!window.confirm('¿Cambiar el código? El enlace actual dejará de funcionar para quien no haya entrado aún.')) return
  void act('regenerate', () => groupStore.regenerateInviteCode(), 'Código cambiado')
}

// ── Settings (admins) ─────────────────────────────────────────

function toggleSection(section: 'shopping' | 'calendar') {
  const g = groupStore.group
  const next = { shoppingEnabled: g.shoppingEnabled, calendarEnabled: g.calendarEnabled }
  if (section === 'shopping') next.shoppingEnabled = !next.shoppingEnabled
  else next.calendarEnabled = !next.calendarEnabled
  if (!next.shoppingEnabled && !next.calendarEnabled) {
    toast.show('El grupo necesita al menos una sección activa')
    return
  }
  void act(`section:${section}`, () => groupStore.updateGroup(next))
}

const renaming = ref(false)
const newName = ref('')

function startRename() {
  newName.value = groupStore.group.name
  renaming.value = true
}

function saveName() {
  const name = newName.value.trim()
  if (!name || name === groupStore.group.name) {
    renaming.value = false
    return
  }
  void act('rename', async () => {
    await groupStore.updateGroup({ name })
    renaming.value = false
  })
}

// ── Leave ─────────────────────────────────────────────────────

const leaving = ref(false)

async function leave() {
  const name = groupStore.group.name
  const lastGroup = groupStore.activeMemberships.length === 1
  const question =
    `¿Salir de ${name}? Dejarás de ver lo que hay en el grupo. Lo que compraste seguirá en su historial.` +
    (lastGroup ? ' Es tu único grupo: volverás a la pantalla de bienvenida.' : '')
  if (!window.confirm(question)) return
  leaving.value = true
  try {
    await groupStore.leaveGroup()
    toast.show(`Has salido de ${name}`)
    await router.replace(groupStore.status === 'no-group' ? { name: 'welcome' } : '/')
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

    <template v-if="groupStore.isAdmin && groupStore.pendingMembers.length">
      <h2 class="section-title"><span>Quieren unirse</span></h2>
      <ul class="rows">
        <li v-for="m in groupStore.pendingMembers" :key="m.id" class="member request">
          <PersonAvatar :name="m.name" :color="m.color" />
          <span class="text">
            <span class="name">{{ m.name }}</span>
            <span class="muted since">Lo pidió {{ timeAgo(m.createdAt) }}</span>
          </span>
          <span class="request-actions">
            <button type="button" class="btn btn-primary small-btn" :disabled="!!busy" @click="approve(m)">Aceptar</button>
            <button type="button" class="btn btn-ghost small-btn" :disabled="!!busy" @click="reject(m)">Rechazar</button>
          </span>
        </li>
      </ul>
    </template>

    <h2 class="section-title"><span>Quién está</span></h2>
    <ul class="rows">
      <li v-for="m in groupStore.activeMembers" :key="m.id">
        <component
          :is="groupStore.isAdmin && !groupStore.isMe(m.id) ? 'button' : 'div'"
          :type="groupStore.isAdmin && !groupStore.isMe(m.id) ? 'button' : undefined"
          class="member"
          :class="{ clickable: groupStore.isAdmin && !groupStore.isMe(m.id) }"
          :aria-expanded="groupStore.isAdmin && !groupStore.isMe(m.id) ? openMemberId === m.id : undefined"
          @click="toggleMember(m)"
        >
          <PersonAvatar :name="m.name" :color="m.color" />
          <span class="text">
            <span class="name">
              {{ m.name }}
              <span v-if="groupStore.isMe(m.id)" class="tag you">tú</span>
              <span v-if="m.role === 'admin'" class="tag">admin</span>
              <span v-if="!m.hasAccount" class="tag plain">sin cuenta</span>
            </span>
            <span class="muted since">Se unió {{ timeAgo(m.createdAt) }}</span>
          </span>
          <AppIcon
            v-if="groupStore.isAdmin && !groupStore.isMe(m.id)"
            name="chevron"
            :size="18"
            class="chevron"
            :class="{ flipped: openMemberId === m.id }"
          />
          <RouterLink v-if="groupStore.isMe(m.id)" :to="{ name: 'account' }" class="account-link">Tu cuenta</RouterLink>
        </component>

        <div v-if="openMemberId === m.id" class="member-actions">
          <template v-if="m.hasAccount">
            <button v-if="m.role !== 'admin'" type="button" class="btn btn-ghost small-btn" :disabled="!!busy" @click="makeAdmin(m)">
              Hacer administrador
            </button>
            <button v-else type="button" class="btn btn-ghost small-btn" :disabled="!!busy" @click="removeAdmin(m)">
              Quitar de administrador
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn-ghost small-btn" :disabled="!!busy" @click="makeClaimCode(m)">
              {{ claimCodes[m.id] ? 'Generar otro código' : 'Código para que use su cuenta' }}
            </button>
            <p v-if="claimCodes[m.id]" class="claim">
              Cuando {{ m.name }} tenga su cuenta, que elija «Tengo un código de perfil» y escriba
              <strong>{{ claimCodes[m.id] }}</strong>
            </p>
          </template>
          <button type="button" class="btn small-btn danger" :disabled="!!busy" @click="removeMember(m)">
            Quitar del grupo
          </button>
        </div>
      </li>
    </ul>

    <template v-if="groupStore.isAdmin">
      <form v-if="addingProfile" class="add-profile" @submit.prevent="addProfile">
        <label class="label">
          Nombre de la persona sin móvil
          <input v-model="profileName" class="field" maxlength="60" placeholder="Por ejemplo, un hijo pequeño" autofocus />
        </label>
        <div class="row-actions">
          <button type="submit" class="btn btn-primary" :disabled="!profileName.trim() || !!busy">Añadir</button>
          <button type="button" class="btn btn-ghost" @click="addingProfile = false">Cancelar</button>
        </div>
      </form>
      <button v-else type="button" class="add-link" @click="addingProfile = true">
        <AppIcon name="plus" :size="18" />
        Añadir a alguien sin móvil
      </button>
    </template>

    <h2 class="section-title"><span>Invitar a alguien</span></h2>
    <section class="invite">
      <p>
        Comparte este enlace. Quien lo abra creará su cuenta y
        {{ groupStore.isAdmin ? 'tendrás que aceptarle' : 'un administrador tendrá que aceptarle' }} aquí.
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
      <button v-if="groupStore.isAdmin" type="button" class="add-link inline" :disabled="!!busy" @click="regenerate">
        Cambiar el código
      </button>
    </section>

    <template v-if="groupStore.isAdmin">
      <h2 class="section-title"><span>Ajustes del grupo</span></h2>
      <ul class="rows">
        <li class="setting">
          <template v-if="renaming">
            <form class="rename" @submit.prevent="saveName">
              <input v-model="newName" class="field" maxlength="60" aria-label="Nombre del grupo" autofocus />
              <button type="submit" class="btn btn-primary small-btn" :disabled="!!busy">Guardar</button>
            </form>
          </template>
          <template v-else>
            <span class="text">
              <span class="name">Nombre</span>
              <span class="muted since">{{ groupStore.group.name }}</span>
            </span>
            <button type="button" class="btn btn-ghost small-btn" @click="startRename">Cambiar</button>
          </template>
        </li>
        <li class="setting">
          <label class="switch-row">
            <span class="text">
              <span class="name">Calendario</span>
              <span class="muted since">Los horarios de cada uno</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              :checked="groupStore.group.calendarEnabled"
              :disabled="!!busy"
              @change="toggleSection('calendar')"
            />
          </label>
        </li>
        <li class="setting">
          <label class="switch-row">
            <span class="text">
              <span class="name">Lista de la compra</span>
              <span class="muted since">Lo que falta en casa e historial</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              :checked="groupStore.group.shoppingEnabled"
              :disabled="!!busy"
              @change="toggleSection('shopping')"
            />
          </label>
        </li>
      </ul>
    </template>

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

.leave-btn,
.danger {
  border: 1.5px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  color: var(--warn);
  background: transparent;
}

.leave-btn:hover,
.danger:hover {
  background: var(--warn-soft);
}

.member {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 64px;
  padding: 10px var(--gutter);
  text-align: left;
}

.member.clickable:hover {
  background: color-mix(in srgb, var(--primary-soft) 50%, transparent);
}

.text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 600;
  font-size: 1.0625rem;
}

.tag {
  margin-left: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary-strong);
  background: var(--primary-soft);
  padding: 2px 8px;
  border-radius: 999px;
  vertical-align: 2px;
}

.tag.you {
  color: var(--qty-ink);
  background: var(--qty-soft);
}

.tag.plain {
  color: var(--text-2);
  background: var(--bg);
}

.since {
  font-size: 0.8125rem;
}

.chevron {
  color: var(--text-2);
  flex-shrink: 0;
  transition: transform 0.15s;
}

.chevron.flipped {
  transform: rotate(180deg);
}

.account-link {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary);
  flex-shrink: 0;
}

.member-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 var(--gutter) 14px calc(var(--gutter) + 56px);
}

.claim {
  flex-basis: 100%;
  font-size: 0.9375rem;
}

.claim strong {
  letter-spacing: 0.06em;
}

.request-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.small-btn {
  min-height: 40px;
  padding-inline: 14px;
  font-size: 0.9375rem;
}

.add-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 var(--gutter);
  color: var(--primary);
  font-weight: 600;
}

.add-link.inline {
  padding: 0;
  justify-self: start;
}

.add-profile {
  display: grid;
  gap: 12px;
  padding: 14px var(--gutter);
}

.row-actions {
  display: flex;
  gap: 8px;
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

.setting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px var(--gutter);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  cursor: pointer;
}

.switch-row input {
  width: 22px;
  height: 22px;
  accent-color: var(--primary);
  flex-shrink: 0;
}

.rename {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
