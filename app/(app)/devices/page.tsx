import { requireUser } from "@/lib/session";
import { listDevices, recentFailedAttempts } from "@/lib/devices";
import { revokeDeviceAction } from "@/actions/devices";
import { ConnectCodeButton } from "@/components/ConnectCodeButton";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—";

export default async function DevicesPage() {
  const user = await requireUser();
  const [devices, failures] = await Promise.all([
    listDevices(user.id),
    recentFailedAttempts(user.id)
  ]);

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-1">Connect an iPhone</h2>
        <p className="text-sm text-neutral-600 mb-4">
          Run the connect Shortcut and enter this code. See SHORTCUT.md.
        </p>
        <ConnectCodeButton />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-neutral-500">No devices yet.</p>
        ) : (
          <table className="w-full text-sm rounded-lg border border-neutral-200 bg-white">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Connected</th>
                <th className="text-left px-3 py-2">Last used</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2">{fmt(d.created_at)}</td>
                  <td className="px-3 py-2">{fmt(d.last_used_at)}</td>
                  <td className="px-3 py-2 text-right">
                    {d.revoked_at ? (
                      <span className="text-neutral-500">Revoked</span>
                    ) : (
                      <form action={revokeDeviceAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-red-600">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent failed receipts</h2>
        {failures.length === 0 ? (
          <p className="text-sm text-neutral-500">None.</p>
        ) : (
          <table className="w-full text-sm rounded-lg border border-neutral-200 bg-white">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Device</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Error</th>
                <th className="text-right px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((a) => (
                <tr key={a.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{fmt(a.created_at)}</td>
                  <td className="px-3 py-2">{a.device ?? "—"}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2 font-mono">{a.error_code ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(1)} s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
