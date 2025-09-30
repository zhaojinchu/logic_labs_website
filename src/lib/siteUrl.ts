const sanitizeOrigin = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!url.protocol.startsWith("http")) return null;
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    console.warn("[siteUrl] Ignoring invalid origin", { value, error });
    return null;
  }
};

/**
 * Returns the safest origin we can find for the running app.
 * Prefers the runtime browser origin to avoid shipping stale build-time env values.
 */
export const getSiteOrigin = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    const runtimeOrigin = sanitizeOrigin(window.location.origin);
    if (runtimeOrigin) return runtimeOrigin;
  }

  const envOrigin = sanitizeOrigin(import.meta.env.VITE_SITE_URL);
  return envOrigin ?? "";
};
