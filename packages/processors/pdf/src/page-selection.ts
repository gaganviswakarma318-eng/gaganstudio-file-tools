export function parsePageSelection(selection: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error("The PDF does not contain any pages.");
  }
  if (!selection.trim()) {
    throw new Error("Enter at least one page number or range.");
  }
  if (selection.length > 20_000) {
    throw new Error("The page selection is too long.");
  }

  const selected: number[] = [];
  const seen = new Set<number>();
  const segments = selection.split(",");

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(segment);
    if (!match) {
      throw new Error(`Invalid page selection "${segment}". Use values like 1, 3-5.`);
    }

    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || last < 1 || first > pageCount || last > pageCount) {
      throw new Error(`Page numbers must be between 1 and ${pageCount}.`);
    }
    if (last < first) {
      throw new Error(`Page range "${segment}" must be in ascending order.`);
    }
    if (last - first + 1 + selected.length > 2000) {
      throw new Error("Select no more than 2,000 pages at a time.");
    }

    for (let page = first; page <= last; page += 1) {
      if (seen.has(page)) {
        throw new Error(`Page ${page} is selected more than once.`);
      }
      seen.add(page);
      selected.push(page);
    }
  }

  return selected;
}
