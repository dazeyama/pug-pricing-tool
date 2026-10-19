// What the prices function's answers mean for the Price screen's page-long cache (decision 357).

/**
 * An answer that isn't one: a name-and-number search that failed comes back with no card and no
 * time (the function's `failed`, or, from a function deployed before it, no time at all). Not
 * kept, so the card is asked for again; a lookup with nothing to search by is a real "no price".
 * @param {{ card?: object|null, fetchedAt?: string|null, failed?: boolean }|undefined} answer
 * @param {{ name?: string, number?: string }|undefined} lookup  the lookup it answers (lookupsFor)
 */
export const didNotAnswer = (answer, lookup) => Boolean(answer?.failed)
  || (answer?.card == null && answer?.fetchedAt == null && Boolean(lookup?.name) && Boolean(lookup?.number));
