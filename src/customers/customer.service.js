import { NotFoundError } from '../errors/index.js';
import { toCustomerResponse } from './customer.mapper.js';

export function createCustomerService({ customerRepository, pronounceService, logger }) {
  async function getCustomer(customerPk) {
    const customer = await customerRepository.findByPk(customerPk);
    if (!customer) {
      logger.warn({ customerPk }, 'Customer not found');
      throw new NotFoundError(`Customer not found: ${customerPk}`);
    }
    return customer;
  }

  return {
    /** Returns `{ total, customers }` for the company, filtered and sorted. */
    async search({ companyId, name, country, orderBy = 'id' }) {
      logger.info({ companyId, name, country, orderBy }, 'Customer search');

      const rows = await customerRepository.search({ companyId, name, country, orderBy });
      const customers = rows.map(toCustomerResponse);
      return { total: customers.length, customers };
    },

    getCustomer,

    /** Looks up the customer and synthesizes "{name} from {country}" as MP3 bytes. */
    async pronounce(customerPk, languageCode) {
      const customer = await getCustomer(customerPk);
      return pronounceService.synthesize({
        name: customer.name,
        country: customer.country,
        languageCode,
      });
    },
  };
}
