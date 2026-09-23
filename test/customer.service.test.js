import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createCustomerService } from '../src/customers/customer.service.js';
import { NotFoundError } from '../src/errors/index.js';
import { sampleRow, silentLogger } from './helpers.js';

describe('customerService', () => {
  it('search maps rows to the API shape and counts them', async () => {
    const customerRepository = { search: mock.fn(async () => [sampleRow]) };
    const service = createCustomerService({ customerRepository, pronounceService: {}, logger: silentLogger });

    const result = await service.search({ companyId: 10, name: 'ana', country: undefined, orderBy: 'name' });

    assert.deepEqual(result, {
      total: 1,
      customers: [
        {
          customerPk: sampleRow.customer_pk,
          id: 1,
          companyId: 10,
          name: 'Ana Souza',
          email: 'ana@example.com',
          age: 34,
          country: 'Brazil',
          phone: '+55 11 99999-0000',
          createdAt: '2025-01-15T10:30:00',
        },
      ],
    });
    assert.deepEqual(customerRepository.search.mock.calls[0].arguments[0], {
      companyId: 10,
      name: 'ana',
      country: undefined,
      orderBy: 'name',
    });
  });

  it('pronounce delegates the customer name and country to the pronounce service', async () => {
    const customerRepository = { findByPk: mock.fn(async () => sampleRow) };
    const pronounceService = { synthesize: mock.fn(async () => Buffer.from('mp3')) };
    const service = createCustomerService({ customerRepository, pronounceService, logger: silentLogger });

    const audio = await service.pronounce(sampleRow.customer_pk, 'pt-BR');

    assert.equal(audio.toString(), 'mp3');
    assert.deepEqual(pronounceService.synthesize.mock.calls[0].arguments[0], {
      name: 'Ana Souza',
      country: 'Brazil',
      languageCode: 'pt-BR',
    });
  });

  it('pronounce throws NotFoundError for an unknown customer', async () => {
    const customerRepository = { findByPk: mock.fn(async () => null) };
    const service = createCustomerService({ customerRepository, pronounceService: {}, logger: silentLogger });

    await assert.rejects(service.pronounce(sampleRow.customer_pk, 'en-US'), NotFoundError);
  });
});
