import type { Project, User } from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { projectsRepository } from './repository.js';

export function listProjects(): Project[] {
  return projectsRepository.list();
}

export function getProjectBySlug(slug: string): Project {
  const project = projectsRepository.findBySlug(slug);
  if (!project) notFound('Project');
  return project;
}

export function createProject(
  actor: User,
  input: { title: string; description: string | null },
): Project {
  if (actor.role !== 'admin') {
    forbidden('Only admins can create projects');
  }
  const slug = slugify(input.title);
  return projectsRepository.create({
    slug,
    title: input.title,
    description: input.description,
    createdBy: actor.id,
  });
}
