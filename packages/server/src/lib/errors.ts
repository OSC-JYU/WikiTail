import Boom from '@hapi/boom';

export function notFound(resource: string): never {
  throw Boom.notFound(`${resource} not found`);
}

export function forbidden(message = 'Forbidden'): never {
  throw Boom.forbidden(message);
}
