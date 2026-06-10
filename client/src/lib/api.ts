// In production the Go server serves this client, so same-origin just works
// on any URL the instance runs behind (LAN IP, tunnel, …). For `vite dev`,
// .env.development points at the local Go server.
export const API_BASE: string =
    import.meta.env.VITE_API_URL ?? window.location.origin;

export function wsGameUrl(token: string): string {
    const base = API_BASE.replace(/^http/, 'ws');
    return `${base}/api/ws/game?token=${encodeURIComponent(token)}`;
}
