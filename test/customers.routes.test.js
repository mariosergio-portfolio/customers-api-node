import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import request from 'supertest';
import { NotFoundError, UpstreamServiceError } from '../src/errors/index.js';
import { buildTestApp, sampleRow } from './helpers.js';

function fakeCustomerService(overrides = {}) {
  return {
    search: mock.fn(async () => ({ total: 0, customers: [] })),
    pronounce: mock.fn(async () => Buffer.from('ID3-fake-mp3')),
    ...overrides,
  };
}

describe('GET /api/companies/:companyId/customers', () => {
  it('returns the search result with parsed and normalised parameters', async () => {
    const customerService = fakeCustomerService({
      search: mock.fn(async () => ({ total: 1, customers: [{ customerPk: sampleRow.customer_pk }] })),
    });
    const app = buildTestApp({ customerService });

    const res = await request(app)
      .get('/api/companies/10/customers')
      .query({ name: '  ana ', country: '', orderBy: 'NAME' })
      .expect(200)
      .expect('Content-Type', /json/);

    assert.deepEqual(res.body, { total: 1, customers: [{ customerPk: sampleRow.customer_pk }] });
    assert.deepEqual(customerService.search.mock.calls[0].arguments[0], {
      companyId: 10,
      name: 'ana',
      country: undefined,
      orderBy: 'name',
    });
  });

  it('defaults orderBy to id', async () => {
    const customerService = fakeCustomerService();
    await request(buildTestApp({ customerService })).get('/api/companies/10/customers').expect(200);
    assert.equal(customerService.search.mock.calls[0].arguments[0].orderBy, 'id');
  });

  it('rejects a non-numeric companyId with 400', async () => {
    const res = await request(buildTestApp({ customerService: fakeCustomerService() }))
      .get('/api/companies/abc/customers')
      .expect(400);

    assert.equal(res.body.status, 400);
    assert.match(res.body.message, /Invalid value 'abc' for parameter 'companyId'/);
    assert.ok(res.body.timestamp);
  });

  it('rejects an unknown orderBy with 400', async () => {
    const res = await request(buildTestApp({ customerService: fakeCustomerService() }))
      .get('/api/companies/10/customers?orderBy=email')
      .expect(400);
    assert.match(res.body.message, /parameter 'orderBy'/);
  });

  it('hides internal error details behind a generic 500', async () => {
    const customerService = fakeCustomerService({
      search: mock.fn(async () => {
        throw new Error('connection refused to 10.0.0.5');
      }),
    });
    const res = await request(buildTestApp({ customerService })).get('/api/companies/10/customers').expect(500);
    assert.equal(res.body.message, 'An unexpected error occurred');
  });

  it('sends CORS headers', async () => {
    const res = await request(buildTestApp({ customerService: fakeCustomerService() }))
      .get('/api/companies/10/customers')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    assert.equal(res.headers['access-control-allow-origin'], '*');
  });
});

describe('GET /api/customers/:customerPk/pronounce', () => {
  it('returns MP3 audio inline', async () => {
    const customerService = fakeCustomerService();
    const res = await request(buildTestApp({ customerService }))
      .get(`/api/customers/${sampleRow.customer_pk}/pronounce?language=pt-br`)
      .expect(200)
      .expect('Content-Type', 'audio/mpeg')
      .expect('Content-Disposition', `inline; filename="${sampleRow.customer_pk}-pronounce.mp3"`)
      .expect('Cross-Origin-Resource-Policy', 'cross-origin');

    assert.equal(res.headers['content-length'], String(Buffer.byteLength('ID3-fake-mp3')));
    assert.deepEqual(customerService.pronounce.mock.calls[0].arguments, [sampleRow.customer_pk, 'pt-BR']);
  });

  it('defaults language to en-US', async () => {
    const customerService = fakeCustomerService();
    await request(buildTestApp({ customerService })).get(`/api/customers/${sampleRow.customer_pk}/pronounce`).expect(200);
    assert.equal(customerService.pronounce.mock.calls[0].arguments[1], 'en-US');
  });

  it('rejects an invalid UUID with 400', async () => {
    const res = await request(buildTestApp({ customerService: fakeCustomerService() }))
      .get('/api/customers/not-a-uuid/pronounce')
      .expect(400);
    assert.match(res.body.message, /parameter 'customerPk'/);
  });

  it('rejects a malformed language with 400', async () => {
    await request(buildTestApp({ customerService: fakeCustomerService() }))
      .get(`/api/customers/${sampleRow.customer_pk}/pronounce?language=../../etc`)
      .expect(400);
  });

  it('maps a missing customer to 404', async () => {
    const customerService = fakeCustomerService({
      pronounce: mock.fn(async (pk) => {
        throw new NotFoundError(`Customer not found: ${pk}`);
      }),
    });
    const res = await request(buildTestApp({ customerService }))
      .get(`/api/customers/${sampleRow.customer_pk}/pronounce`)
      .expect(404);
    assert.equal(res.body.message, `Customer not found: ${sampleRow.customer_pk}`);
  });

  it('maps a Polly failure to 502', async () => {
    const customerService = fakeCustomerService({
      pronounce: mock.fn(async () => {
        throw new UpstreamServiceError('AWS Polly synthesis failed');
      }),
    });
    await request(buildTestApp({ customerService })).get(`/api/customers/${sampleRow.customer_pk}/pronounce`).expect(502);
  });

  it('rate-limits pronounce requests', async () => {
    const app = buildTestApp({ customerService: fakeCustomerService(), env: { PRONOUNCE_RATE_LIMIT_PER_MINUTE: '2' } });
    const url = `/api/customers/${sampleRow.customer_pk}/pronounce`;
    await request(app).get(url).expect(200);
    await request(app).get(url).expect(200);
    const res = await request(app).get(url).expect(429);
    assert.equal(res.body.status, 429);
  });
});

describe('operational endpoints', () => {
  it('GET /health reports UP', async () => {
    await request(buildTestApp({ customerService: fakeCustomerService() })).get('/health').expect(200, { status: 'UP' });
  });

  it('GET /ready reports DOWN when the database is unreachable', async () => {
    const app = buildTestApp({
      customerService: fakeCustomerService(),
      checkReadiness: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await request(app).get('/ready').expect(503, { status: 'DOWN' });
  });

  it('serves the OpenAPI document and Swagger UI', async () => {
    const app = buildTestApp({ customerService: fakeCustomerService() });
    const res = await request(app).get('/v3/api-docs').expect(200);
    assert.equal(res.body.info.title, 'Customers API (NODE)');
    await request(app).get('/swagger-ui.html').expect(302).expect('Location', '/swagger-ui/index.html');

    for (const path of ['/swagger-ui/', '/swagger-ui/index.html']) {
      const page = await request(app).get(path).expect(200).expect('Content-Type', /html/);
      assert.match(page.text, /swagger-ui-init\.js/, `${path} must load our spec, not the Petstore demo`);
    }
    const init = await request(app).get('/swagger-ui/swagger-ui-init.js').expect(200);
    assert.match(init.text, /"title": "Customers API (NODE)"/);
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(buildTestApp({ customerService: fakeCustomerService() })).get('/nope').expect(404);
    assert.equal(res.body.status, 404);
  });
});
