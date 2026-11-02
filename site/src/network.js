// Bound every database request, including stalled response bodies.
export function createTimedFetch(fetchImpl = globalThis.fetch, timeoutMs = 10000) {
  return async (url, options = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const body = await response.arrayBuffer();
      return new Response(body.byteLength ? body : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}

// PostgREST caps individual responses. Keep reading until the total is reached.
export async function readAll(buildQuery, pageSize = 1000) {
  const rows = [];
  while (true) {
    const { data, error, count } = await buildQuery().range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data?.length || (count != null ? rows.length >= count : data.length < pageSize)) return rows;
  }
}
