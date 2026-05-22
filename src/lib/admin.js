// OpenCITE — Admin Gate (v.19)
// Reads VITE_ADMIN_EMAILS env var (comma-separated, set in Vercel dashboard).
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isAdmin(user) {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}
