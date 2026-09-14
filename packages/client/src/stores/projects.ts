import { defineStore } from 'pinia';
import type { Project } from '@wikitail/shared';
import { projectsApi } from '../api/projects';

export const useProjectsStore = defineStore('projects', {
  state: () => ({
    projects: [] as Project[],
    loaded: false,
  }),
  actions: {
    async fetchAll() {
      this.projects = await projectsApi.list();
      this.loaded = true;
    },
    async create(input: { title: string; description?: string }) {
      const project = await projectsApi.create(input);
      this.projects.unshift(project);
      return project;
    },
  },
});
