const COLUMNS = 'customer_pk, id, company_id, name, email, age, country, phone, created_at';

// ORDER BY cannot be parameterised, so it is chosen from a fixed whitelist.
const ORDER_BY_SQL = {
  id: 'id ASC',
  name: 'name ASC',
};

/** Escapes LIKE wildcards so user input such as "50%" or "a_b" is matched literally. */
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createCustomerRepository(pool) {
  return {
    /**
     * Customers of a company with optional case-insensitive partial-text filters (combined with AND).
     */
    async search({ companyId, name, country, orderBy }) {
      const sql = `
        SELECT ${COLUMNS}
          FROM customer
         WHERE company_id = $1
           AND ($2::text IS NULL OR name    ILIKE '%' || $2 || '%' ESCAPE '\\')
           AND ($3::text IS NULL OR country ILIKE '%' || $3 || '%' ESCAPE '\\')
         ORDER BY ${ORDER_BY_SQL[orderBy] ?? ORDER_BY_SQL.id}`;

      const { rows } = await pool.query(sql, [
        companyId,
        name == null ? null : escapeLike(name),
        country == null ? null : escapeLike(country),
      ]);
      return rows;
    },

    async findByPk(customerPk) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer WHERE customer_pk = $1`, [customerPk]);
      return rows[0] ?? null;
    },
  };
}
