/**
 * Circle-method round robin. Returns rounds of index pairs over 0..n-1.
 * Odd n is padded with a BYE that is dropped from the output, so every round
 * has floor(n/2) matches and no index appears twice within a round.
 */
export function roundRobinRounds(n: number): Array<Array<[number, number]>> {
  if (n < 2) return [];
  const BYE = -1;
  const items: number[] = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) items.push(BYE);
  const m = items.length;
  const rounds: Array<Array<[number, number]>> = [];

  // Fix items[0]; rotate the rest each round.
  const rot = items.slice(1);
  for (let r = 0; r < m - 1; r++) {
    const arr = [items[0]!, ...rot];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i]!;
      const b = arr[m - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      // Alternate home/away a little so the fixed item isn't always first.
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rot.unshift(rot.pop()!);
  }
  return rounds;
}
