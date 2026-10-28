// Turns the OpenAPI document into a Postman collection (v2.1), so the API can be tried without
// writing any code. Pure: no files, no network.
const toPostmanPath = (path) => path.replace(/\{(\w+)\}/g, ':$1');
const exampleOf = (schema = {}) => schema.example ?? schema.default ?? (schema.enum ? schema.enum[0] : '');

const authOf = (operation) => {
  const scheme = operation.security?.[0] && Object.keys(operation.security[0])[0];
  if (!scheme) return { type: 'noauth' };
  return { type: 'bearer', bearer: [{ key: 'token', value: `{{${scheme}}}`, type: 'string' }] };
};

const itemOf = (method, path, operation) => {
  const query = (operation.parameters ?? []).filter((p) => p.in === 'query');
  const variables = (operation.parameters ?? []).filter((p) => p.in === 'path');
  const segments = toPostmanPath(path).split('/').filter(Boolean);
  const enabledQuery = query.filter((p) => p.required).map((p) => `${p.name}=${exampleOf(p.schema)}`);
  const body = operation.requestBody?.content?.['application/json'];

  const item = {
    name: operation.summary,
    request: {
      method: method.toUpperCase(),
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: {
        raw: `{{baseUrl}}/${segments.join('/')}${enabledQuery.length ? `?${enabledQuery.join('&')}` : ''}`,
        host: ['{{baseUrl}}'],
        path: segments,
        query: query.map((p) => ({ key: p.name, value: String(exampleOf(p.schema)), disabled: !p.required, description: p.description })),
        variable: variables.map((p) => ({ key: p.name, value: String(exampleOf(p.schema)), description: p.description })),
      },
      auth: authOf(operation),
      description: [operation.description, `Operation: ${operation.operationId}`].filter(Boolean).join('\n\n'),
      ...(body && { body: { mode: 'raw', raw: JSON.stringify(body.example ?? {}, null, 2), options: { raw: { language: 'json' } } } }),
    },
    response: [],
  };

  // Signing in stores the admin token for every other request in the collection.
  if (operation.operationId === 'adminLogin') {
    item.event = [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: ['const body = pm.response.json();', "if (body.success) pm.collectionVariables.set('adminToken', body.data.token);"],
      },
    }];
  }
  return item;
};

export const buildPostmanCollection = (spec) => {
  const folders = new Map(spec.tags.map((tag) => [tag.name, []]));
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      folders.get(operation.tags[0]).push(itemOf(method, path, operation));
    }
  }

  return {
    info: {
      name: spec.info.title,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: [
        spec.info.description,
        '',
        'Setup: set `baseUrl` (collection variable). For user requests set `userToken`: in local development run `npm run dev-token` in the backend folder and paste the result. For admin requests run "Sign in as the admin" once; it stores `adminToken` for you.',
      ].join('\n'),
    },
    variable: [
      { key: 'baseUrl', value: spec.servers[0].url },
      { key: 'userToken', value: '' },
      { key: 'adminToken', value: '' },
    ],
    item: [...folders.entries()].filter(([, items]) => items.length > 0).map(([name, items]) => ({ name, item: items })),
  };
};
