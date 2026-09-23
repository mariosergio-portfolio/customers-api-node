/** Maps a `customer` table row to the public API shape (same field names as the Java DTO). */
export function toCustomerResponse(row) {
  return {
    customerPk: row.customer_pk,
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    age: row.age,
    country: row.country,
    phone: row.phone,
    createdAt: row.created_at,
  };
}
