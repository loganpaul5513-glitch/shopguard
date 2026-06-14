export async function fetchCompanyRecordIds(client, companyId, companyCode) {
  const ids = new Set([companyId].filter(Boolean));

  if (companyCode) {
    const { data } = await client
      .from("employees")
      .select("company_id")
      .eq("company_code", companyCode);

    for (const row of data || []) {
      if (row.company_id) ids.add(row.company_id);
    }
  }

  return [...ids];
}

export function applyCompanyIdFilter(query, companyIds) {
  if (companyIds.length === 1) {
    return query.eq("company_id", companyIds[0]);
  }
  return query.in("company_id", companyIds);
}
