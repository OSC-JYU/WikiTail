import { createRouter, createWebHistory } from 'vue-router';
import BrowseHomeView from '../views/BrowseHomeView.vue';
import BrowseProjectView from '../views/BrowseProjectView.vue';
import BrowseArticleView from '../views/BrowseArticleView.vue';
import WelcomeView from '../views/WelcomeView.vue';
import HelpView from '../views/HelpView.vue';
import HomeView from '../views/HomeView.vue';
import ProjectView from '../views/ProjectView.vue';
import ProjectMembersView from '../views/ProjectMembersView.vue';
import ArticleEditorView from '../views/ArticleEditorView.vue';
import { useAuthStore } from '../stores/auth';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Public browsing lives at the root — it is the site visitors see.
    { path: '/', name: 'browse-home', component: BrowseHomeView },
    { path: '/p/:project', name: 'browse-project', component: BrowseProjectView, props: true },
    {
      path: '/p/:project/:language/:article',
      name: 'browse-article',
      component: BrowseArticleView,
      props: true,
    },

    // Authoring. Guarded by the beforeEach hook below — an SSO'd visitor who
    // is not on the users guest list is bounced to the browse home so the
    // "not authorised" banner is what they see rather than a broken view.
    { path: '/admin', name: 'admin-home', component: WelcomeView, meta: { requiresUser: true } },
    { path: '/admin/help', name: 'help', component: HelpView, meta: { requiresUser: true } },
    {
      path: '/admin/tools',
      name: 'admin-tools',
      component: HomeView,
      meta: { requiresUser: true },
    },
    {
      path: '/admin/p/:slug',
      name: 'project',
      component: ProjectView,
      props: true,
      meta: { requiresUser: true },
    },
    {
      path: '/admin/p/:slug/members',
      name: 'project-members',
      component: ProjectMembersView,
      props: true,
      meta: { requiresUser: true },
    },
    {
      path: '/admin/p/:slug/a/:id',
      name: 'article-edit',
      component: ArticleEditorView,
      props: true,
      meta: { requiresUser: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresUser) return true;
  // The guard runs before App.vue's onMounted fires, so we may need to trigger
  // the first identity fetch here. `load()` is idempotent — App.vue calling it
  // again is a no-op.
  const auth = useAuthStore();
  if (!auth.loaded) await auth.load();
  return auth.user ? true : { name: 'browse-home' };
});
