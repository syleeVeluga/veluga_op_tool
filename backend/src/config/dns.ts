import dns from "node:dns";

export function ensureDnsServers(): void {
  const servers = dns.getServers();
  const hasOnlyLocalhost =
    servers.length === 0 ||
    servers.every((server) => server === "127.0.0.1" || server === "::1");

  if (!hasOnlyLocalhost) {
    return;
  }

  console.warn(
    `[dns] Node.js DNS servers are localhost-only (${servers.join(",")}), overriding with 8.8.8.8 / 8.8.4.4`
  );
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}
