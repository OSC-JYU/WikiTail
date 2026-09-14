import { createRouter, createWebHistory } from 'vue-router';
import BrowseHomeView from '../views/BrowseHomeView.vue';
import BrowseProjectView from '../views/BrowseProjectView.vue';
import BrowseArticleView from '../views/BrowseArticleView.vue';
import HomeView from '../views/HomeView.vue';
import ProjectView from '../views/ProjectView.vue';
import ArticleEditorView from '../views/ArticleEditorView.vue';

export const router = createRouter({
  history: createWebHistory(),
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

    // Authoring.
    { path: '/admin', name: 'admin-home', component: HomeView },
    { path: '/admin/p/:slug', name: 'project', component: ProjectView, props: true },
    {
      path: '/admin/p/:slug/a/:id',
      name: 'article-edit',
      component: ArticleEditorView,
      props: true,
    },
  ],
});
