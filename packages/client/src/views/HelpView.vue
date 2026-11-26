<script setup lang="ts">
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <article class="help">
    <p class="crumb">
      <RouterLink :to="{ name: 'admin-home' }">{{ $t('help.back') }}</RouterLink>
    </p>

    <h1>{{ $t('help.title') }}</h1>

    <p>
      <RouterLink :to="{ name: 'tutorial' }">{{ $t('tutorial.helpLink') }}</RouterLink>
    </p>

    <section>
      <h2>{{ $t('help.projectsHeading') }}</h2>
      <p>{{ $t('help.projectsBody1') }}</p>
      <p>{{ $t('help.projectsBody2') }}</p>
    </section>

    <section>
      <h2>{{ $t('help.draftHeading') }}</h2>
      <p>{{ $t('help.draftBody') }}</p>
    </section>

    <section>
      <h2>{{ $t('help.libraryHeading') }}</h2>
      <p>{{ $t('help.libraryBody1') }}</p>
      <p>{{ $t('help.libraryBody2') }}</p>
    </section>

    <section>
      <h2>{{ $t('help.languagesHeading') }}</h2>
      <p>{{ $t('help.languagesBody') }}</p>
    </section>

    <section>
      <h2>{{ $t('help.rolesHeading') }}</h2>
      <ul class="roles">
        <li>{{ $t('help.rolesReader') }}</li>
        <li>{{ $t('help.rolesEditor') }}</li>
        <li>{{ $t('help.rolesManager') }}</li>
        <!-- Admins get the sentence wrapped in a link to the tools page; everyone
             else just reads the same sentence — a non-admin has nowhere useful
             to go from here. -->
        <li v-if="auth.isAdmin">
          <RouterLink :to="{ name: 'admin-tools' }">{{ $t('help.rolesAdmin') }}</RouterLink>
        </li>
        <li v-else>{{ $t('help.rolesAdmin') }}</li>
      </ul>
    </section>

    <section>
      <h2>{{ $t('help.startHeading') }}</h2>
      <ol>
        <li>
          <RouterLink :to="{ name: 'admin-home' }">{{ $t('help.start1') }}</RouterLink>
        </li>
        <li>{{ $t('help.start2') }}</li>
        <li>{{ $t('help.start3') }}</li>
        <li>{{ $t('help.start4') }}</li>
        <li>{{ $t('help.start5') }}</li>
      </ol>
    </section>
  </article>
</template>

<style scoped>
.help {
  line-height: 1.6;
}
.crumb {
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.help h1 {
  margin-bottom: 1.5rem;
}
.help h2 {
  margin-top: 2rem;
  font-size: 1.15rem;
}
.help section {
  margin: 0 0 1.5rem;
}
.help p,
.help ul,
.help ol {
  color: var(--text);
}
.help .roles {
  padding-left: 1.25rem;
}
.help .roles li {
  margin: 0.35rem 0;
}
</style>
