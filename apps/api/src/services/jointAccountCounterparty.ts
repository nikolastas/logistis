/** Match joint account names only when every holder is an unambiguous household member. */
export function isJointHouseholdCounterparty(
  counterparty: string,
  users: readonly { id: string; householdId: string; nameAliases?: string[] | null }[],
): boolean {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const holders = counterparty.split("&").map(normalize);
  if (holders.length < 2 || holders.some((holder) => holder.length < 2)) return false;
  const householdIds = new Set(users.map((user) => user.householdId));
  if (householdIds.size !== 1 || !users[0]?.householdId) return false;
  const matchedIds: string[] = [];
  for (const holder of holders) {
    const matches = users.filter((user) =>
      (user.nameAliases ?? []).some((alias) => normalize(alias) === holder),
    );
    if (matches.length !== 1) return false;
    matchedIds.push(matches[0].id);
  }
  return new Set(matchedIds).size === holders.length;
}
