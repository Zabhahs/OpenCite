export function apiCall(endpoint, method, body) {
  return fetch(endpoint, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
