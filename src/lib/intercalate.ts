/**
 * Round-robin intercalation: given items grouped by some key,
 * return them in interleaved order so no two adjacent items share the key
 * (as much as possible — if one group is much larger, it'll repeat at the tail).
 */
export function intercalate<T>(items: T[], keyFn: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // Shuffle within each group so order isn't predictable
  for (const list of Array.from(groups.values())) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const out: T[] = [];
  while (groups.size > 0) {
    // Sort groups by remaining size (largest first) to push the tail
    const entries = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
    for (const [key, list] of entries) {
      if (list.length === 0) {
        groups.delete(key);
        continue;
      }
      out.push(list.shift()!);
    }
  }
  return out;
}
