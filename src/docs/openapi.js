const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Customers API',
    description: 'REST API for querying imported customers with partial text search on name and/or country',
    version: '1.0.0',
  },
  tags: [{ name: 'Customers', description: 'Endpoints for querying customers with optional partial-text filters' }],
  paths: {
    '/api/companies/{companyId}/customers': {
      get: {
        tags: ['Customers'],
        operationId: 'searchCustomers',
        summary: 'Search customers',
        description:
          'Returns all customers for the given company. Optional query parameters `name` and `country` perform ' +
          'case-insensitive partial-text filtering. When both are provided they are combined with AND.',
        parameters: [
          { name: 'companyId', in: 'path', required: true, description: 'Company identifier', schema: { type: 'integer', format: 'int64' } },
          { name: 'name', in: 'query', description: 'Partial text filter on customer name (case-insensitive)', schema: { type: 'string', maxLength: 255 } },
          { name: 'country', in: 'query', description: 'Partial text filter on country (case-insensitive)', schema: { type: 'string', maxLength: 255 } },
          { name: 'orderBy', in: 'query', description: "Sort order: 'id' (default) or 'name'", schema: { type: 'string', enum: ['id', 'name'], default: 'id' } },
        ],
        responses: {
          200: {
            description: 'Search executed successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerPageResponse' } } },
          },
          400: errorResponse('Invalid request parameters'),
          500: errorResponse('Unexpected server error'),
        },
      },
    },
    '/api/customers/{customerPk}/pronounce': {
      get: {
        tags: ['Customers'],
        operationId: 'pronounceCustomer',
        summary: 'Pronounce customer name',
        description: "Calls AWS Polly Neural TTS to synthesize the customer's name and country, returning MP3 audio.",
        parameters: [
          { name: 'customerPk', in: 'path', required: true, description: 'Customer PK', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'language',
            in: 'query',
            description: 'BCP-47 language code for Polly TTS (e.g. en-US, pt-BR). Defaults to en-US.',
            schema: { type: 'string', default: 'en-US' },
          },
        ],
        responses: {
          200: { description: 'MP3 audio bytes', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          400: errorResponse('Invalid request parameters or unsupported language'),
          404: errorResponse('Customer not found'),
          429: errorResponse('Rate limit exceeded'),
          500: errorResponse('Unexpected server error'),
          502: errorResponse('AWS Polly failed'),
        },
      },
    },
  },
  components: {
    schemas: {
      CustomerResponse: {
        type: 'object',
        properties: {
          customerPk: { type: 'string', format: 'uuid' },
          id: { type: 'integer', format: 'int64' },
          companyId: { type: 'integer', format: 'int64' },
          name: { type: 'string' },
          email: { type: 'string' },
          age: { type: ['integer', 'null'] },
          country: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CustomerPageResponse: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          customers: { type: 'array', items: { $ref: '#/components/schemas/CustomerResponse' } },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'integer' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
