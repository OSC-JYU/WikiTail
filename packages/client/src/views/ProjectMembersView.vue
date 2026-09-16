<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type {
  BatchAddMembersResult,
  Project,
  ProjectMember,
  ProjectMemberRole,
} from '@wikitail/shared';
import { membersApi } from '../api/members';
import { projectsApi } from '../api/projects';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();

const project = ref<Project | null>(null);
const members = ref<ProjectMember[]>([]);
const error = ref<string | null>(null);

// Batch-add form
const emailsInput = ref('');
const newRole = ref<ProjectMemberRole>('editor');
const submitting = ref(false);
const lastResult = ref<BatchAddMembersResult | null>(null);

/** Managers and admins may change members; editors can only see the list. */
const canManage = computed(() => {
  if (auth.isAdmin) return true;
  const me = members.value.find((m) => m.userId === auth.user?.id);
  return me?.role === 'manager';
});

async function load() {
  try {
    project.value = await projectsApi.get(props.slug);
    members.value = await membersApi.list(props.slug);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load project members';
  }
}

onMounted(load);

/**
 * The paste field accepts one email per line *or* commas, whichever the user
 * finds easiest — the server splits and validates anyway.
 */
function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function submitBatch() {
  const emails = parseEmails(emailsInput.value);
  if (emails.length === 0) return;
  submitting.value = true;
  error.value = null;
  try {
    const result = await membersApi.addBatch(props.slug, emails, newRole.value);
    lastResult.value = result;
    // Merge freshly added rows into the current list without a full refetch.
    members.value = [...members.value, ...result.added].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
    // Only clear the field if everything went in cleanly. Otherwise leave the
    // input so the manager can see which lines were the problem.
    if (result.invalid.length === 0 && result.alreadyMembers.length === 0) {
      emailsInput.value = '';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not add those users';
  } finally {
    submitting.value = false;
  }
}

async function changeRole(member: ProjectMember, role: ProjectMemberRole) {
  if (member.role === role) return;
  error.value = null;
  try {
    const updated = await membersApi.updateRole(props.slug, member.userId, role);
    members.value = members.value.map((m) => (m.userId === updated.userId ? updated : m));
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not change role';
  }
}

async function removeMember(member: ProjectMember) {
  if (!confirm(`Remove ${member.email} from this project?`)) return;
  error.value = null;
  try {
    await membersApi.remove(props.slug, member.userId);
    members.value = members.value.filter((m) => m.userId !== member.userId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not remove that member';
  }
}
</script>

<template>
  <div v-if="project">
    <p class="crumb">
      <RouterLink :to="{ name: 'project', params: { slug: project.slug } }">
        ← {{ project.title }}
      </RouterLink>
    </p>

    <h1>Members</h1>
    <p class="hint">
      Managers can change project settings and add or remove members. Editors can write and edit
      articles in this project. Everyone signed in can read published pages — non-members just
      can't see drafts or make changes.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="canManage" class="batch">
      <h2>Add people</h2>
      <p class="hint">
        Paste emails, one per line or separated by commas. Anyone not yet in Wikitail is created
        with basic access — SSO sign-in will just work when they arrive.
      </p>
      <form @submit.prevent="submitBatch">
        <textarea
          v-model="emailsInput"
          rows="6"
          placeholder="alice@example.org&#10;bob@example.org, carol@example.org"
        />
        <div class="row">
          <label>
            Role:
            <select v-model="newRole">
              <option value="editor">editor</option>
              <option value="manager">manager</option>
            </select>
          </label>
          <button type="submit" :disabled="submitting">Add to project</button>
        </div>
      </form>

      <div v-if="lastResult" class="result">
        <p v-if="lastResult.added.length">
          Added {{ lastResult.added.length }}
          {{ lastResult.added.length === 1 ? 'person' : 'people' }}.
        </p>
        <p v-if="lastResult.createdUsers.length">
          Created new Wikitail accounts for:
          <span class="emails">{{ lastResult.createdUsers.join(', ') }}</span>
        </p>
        <p v-if="lastResult.alreadyMembers.length" class="warn">
          Already members:
          <span class="emails">{{ lastResult.alreadyMembers.join(', ') }}</span>
        </p>
        <p v-if="lastResult.invalid.length" class="warn">
          Not a valid email:
          <span class="emails">{{ lastResult.invalid.join(', ') }}</span>
        </p>
      </div>
    </section>

    <section class="list">
      <h2>Current members ({{ members.length }})</h2>
      <p v-if="members.length === 0">No members yet.</p>
      <ul>
        <li v-for="member in members" :key="member.userId">
          <span class="email">{{ member.email }}</span>
          <span class="controls">
            <select
              v-if="canManage"
              :value="member.role"
              @change="changeRole(member, ($event.target as HTMLSelectElement).value as ProjectMemberRole)"
            >
              <option value="editor">editor</option>
              <option value="manager">manager</option>
            </select>
            <span v-else class="role-tag">{{ member.role }}</span>
            <button v-if="canManage" type="button" class="remove" @click="removeMember(member)">
              Remove
            </button>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.crumb {
  margin-bottom: 1rem;
  font-size: 0.85rem;
}
.hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.45;
}
.error {
  color: #c0392b;
}
.batch {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  margin-top: 1rem;
}
.batch textarea {
  width: 100%;
  padding: 0.5rem;
  font-family: inherit;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.row {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 0.5rem;
}
.result {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface, transparent);
}
.result p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}
.result .warn {
  color: #b7791f;
}
.emails {
  font-family: monospace;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.list {
  margin-top: 2rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.list ul {
  list-style: none;
  padding: 0;
}
.list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border);
}
.email {
  overflow-wrap: anywhere;
}
.controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.role-tag {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-muted);
}
.remove {
  font-size: 0.8rem;
  color: #c0392b;
  background: none;
  border: 1px solid var(--border);
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
}
.remove:hover {
  background: #c0392b;
  color: white;
}
</style>
