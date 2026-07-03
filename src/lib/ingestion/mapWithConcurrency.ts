export async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<TResult>,
  onError: (item: T, error: unknown, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        try {
          results[currentIndex] = await task(
            items[currentIndex],
            currentIndex,
          );
        } catch (error) {
          results[currentIndex] = await onError(
            items[currentIndex],
            error,
            currentIndex,
          );
        }
      }
    },
  );

  await Promise.all(workers);
  return results;
}
