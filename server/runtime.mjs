export function runtimeConfig(env, { dev = false } = {}) {
  const port = Number(env.PORT || 3443);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535");
  const secure = Boolean(env.TLS_CERT && env.TLS_KEY);
  if (Boolean(env.TLS_CERT) !== Boolean(env.TLS_KEY))
    throw new Error("TLS_CERT and TLS_KEY must be supplied together");
  if (env.TLS_TERMINATION && env.TLS_TERMINATION !== "loopback")
    throw new Error("TLS_TERMINATION must be loopback when set");
  const proxy = env.TLS_TERMINATION === "loopback";
  if (proxy && secure)
    throw new Error("Choose direct TLS or loopback TLS termination, not both");
  if (!secure && !proxy && !dev)
    throw new Error(
      "Production requires TLS_CERT/TLS_KEY or TLS_TERMINATION=loopback",
    );
  if (proxy && !env.PUBLIC_ORIGIN)
    throw new Error("Loopback TLS termination requires an HTTPS PUBLIC_ORIGIN");
  const origin =
    env.PUBLIC_ORIGIN || `${secure ? "https" : "http"}://localhost:${port}`;
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment",
    );
  if ((!dev || proxy) && url.protocol !== "https:")
    throw new Error("PUBLIC_ORIGIN must use HTTPS");
  const bind = env.BIND || (secure ? "0.0.0.0" : "127.0.0.1");
  if (proxy && bind !== "127.0.0.1")
    throw new Error("Loopback TLS termination must bind to 127.0.0.1");
  return {
    port,
    secure,
    secureBrowser: secure || proxy,
    bind,
    origin,
    hostUrl: proxy
      ? `ws://127.0.0.1:${port}/signal`
      : origin.replace(/^http/, "ws") + "/signal",
  };
}
