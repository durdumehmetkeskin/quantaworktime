import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { formatDateTime, formatTime } from "../lib/format";
import { Badge, Card, EmptyState, Spinner } from "../components/ui";

interface DailyEmployee {
  userId: string;
  fullName: string;
  employeeCode: string | null;
  department: string | null;
  firstIn: string | null;
  lastOut: string | null;
  lateMinutes: number;
  isInside: boolean;
  recordCount: number;
}

interface AuditItem {
  id: string;
  userId: string | null;
  action: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

const POLL_MS = 30_000; // spec: canlı, 30 sn polling

export function DashboardPage() {
  const daily = useQuery({
    queryKey: ["reports", "daily"],
    queryFn: async () => (await api.get<{ date: string; employees: DailyEmployee[] }>("/reports/daily")).data,
    refetchInterval: POLL_MS,
  });

  const failures = useQuery({
    queryKey: ["audit", "failures"],
    queryFn: async () =>
      (
        await api.get<{ items: AuditItem[] }>("/audit-logs", {
          params: { action: "ATTENDANCE_CHECK_FAILED", pageSize: 10 },
        })
      ).data,
    refetchInterval: POLL_MS,
  });

  const employees = daily.data?.employees ?? [];
  const inside = employees.filter((e) => e.isInside);
  const late = employees.filter((e) => e.lateMinutes > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-slate-800">Panel</h1>
        <span className="text-sm text-slate-500">{daily.data?.date}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="İçeride" value={inside.length} tone="text-emerald-600" />
        <StatCard label="Dışarıda" value={employees.length - inside.length} tone="text-slate-600" />
        <StatCard label="Bugün Geç Kalan" value={late.length} tone="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Bugünkü Durum">
          {daily.isLoading ? (
            <Spinner />
          ) : employees.length === 0 ? (
            <EmptyState message="Aktif çalışan bulunamadı." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2">Çalışan</th>
                  <th>Giriş</th>
                  <th>Çıkış</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.userId} className="border-b border-slate-100">
                    <td className="py-2">
                      <div className="font-medium text-slate-800">{e.fullName}</div>
                      <div className="text-xs text-slate-400">{e.department ?? "—"}</div>
                    </td>
                    <td>
                      {formatTime(e.firstIn)}
                      {e.lateMinutes > 0 && (
                        <span className="ml-1 text-xs text-amber-600">+{e.lateMinutes} dk</span>
                      )}
                    </td>
                    <td>{formatTime(e.lastOut)}</td>
                    <td>
                      {e.isInside ? (
                        <Badge tone="green">İçeride</Badge>
                      ) : e.recordCount > 0 ? (
                        <Badge tone="slate">Çıktı</Badge>
                      ) : (
                        <Badge tone="red">Gelmedi</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Son Başarısız Doğrulama Denemeleri">
          {failures.isLoading ? (
            <Spinner />
          ) : (failures.data?.items.length ?? 0) === 0 ? (
            <EmptyState message="Başarısız deneme yok. 🎉" />
          ) : (
            <ul className="space-y-2">
              {failures.data!.items.map((item) => (
                <li key={item.id} className="rounded-lg bg-rose-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-rose-700">
                      Adım {String(item.detail.step ?? "?")} — {String(item.detail.reason ?? "bilinmiyor")}
                    </span>
                    <span className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Kullanıcı: {item.userId ?? "—"} · IP: {item.ip ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
