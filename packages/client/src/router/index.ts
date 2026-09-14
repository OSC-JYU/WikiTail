import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import ProjectView from '../views/ProjectView.vue';
import ArticleEditorView from '../views/ArticleEditorView.vue';
import BrowseArticleView from '../views/BrowseArticleView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/projects/:slug', name: 'project', component: ProjectView, props: true },
    {
      path: '/projects/:slug/articles/:id/edit',
      name: 'article-edit',
      component: ArticleEditorView,
      props: true,
    },
    {
      path: '/projects/:slug/articles/:id',
      name: 'article-browse',
      component: BrowseArticleView,
      props: true,
    },
  ],
});
