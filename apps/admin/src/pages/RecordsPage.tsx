import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Badge, Button, Card, EmptyState, inputClass, Spinner } from "../components/ui";

interface RecordRow {
  id: string;
  userFullName: string;
  employeeCode: string | null;
  tabletName: string | null;
  type: "IN" | "OUT";
  timestamp: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isManual: boolean;
  note: string | null;
}

interface AuditItem {
  id: string;
  userId: string | null;
  action: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

interface UserOption {
  id: string;
  fullName: string;
}

interface TabletOption {
  id: string;
  name: string;
}

export function RecordsPage() {
  const [tab, setTab] = useState<"records" | "audit">("records");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Kayıtlar</h1>
        <div className="flex rounded-lg bg-slate-200 p-1">
          <TabButton active={tab === "records"} onClick={() => setTab("records")}>
            Giriş / Çıkış
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
            Denetim Kaydı
          </TabButton>
        </div>
      </div>
      {tab === "records" ? <AttendanceTab /> : <AuditTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AttendanceTab() {
  const [userId, setUserId] = useState("");
  const [tabletId, setTabletId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserOption[]>("/users")).data,
  });
  const tablets = useQuery({
    queryKey: ["tablets"],
    queryFn: async () => (await api.get<TabletOption[]>("/tablets")).data,
  });

  const records = useQuery({
    queryKey: ["attendance-list", { userId, tabletId, from, to, page }],
    queryFn: async () =>
      (
        await api.get<{ items: RecordRow[]; total: number }>("/attendance", {
          params: {
            userId: userId || undefined,
            tabletId: tabletId || undefined,
            from: from ? `${from}T00:00:00+03:00` : undefined,
            to: to ? `${to}T23:59:59+03:00` : undefined,
            page,
            pageSize,
          },
        })
      ).data,
  });

  const totalPages = Math.max(1, Math.ceil((records.data?.total ?? 0) / pageSize));

  return (
    <Card>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <select className={inputClass} value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
          <option value="">Tüm çalışanlar</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <select className={inputClass} value={tabletId} onChange={(e) => { setTabletId(e.target.value); setPage(1); }}>
          <option value="">Tüm tabletler</option>
          {tablets.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input className={inputClass} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input className={inputClass} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      {records.isLoading ? (
        <Spinner />
      ) : (records.data?.items.length ?? 0) === 0 ? (
        <EmptyState message="Kayıt bulunamadı." />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Tarih/Saat</th>
                <th>Çalışan</th>
                <th>Tip</th>
                <th>Tablet</th>
                <th>Geç / Erken</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {records.data!.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2">{formatDateTime(r.timestamp)}</td>
                  <td>
                    {r.userFullName}
                    <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                  </td>
                  <td>
                    <Badge tone={r.type === "IN" ? "green" : "red"}>{r.type === "IN" ? "Giriş" : "Çıkış"}</Badge>
                    {r.isManual && (
                      <span className="ml-1">
                        <Badge tone="indigo">Manuel</Badge>
                      </span>
                    )}
                  </td>
                  <td>{r.tabletName ?? "—"}</td>
                  <td className="text-xs">
                    {r.lateMinutes > 0 && <span className="text-amber-600">{r.lateMinutes} dk geç</span>}
                    {r.earlyLeaveMinutes > 0 && <span className="text-rose-600"> {r.earlyLeaveMinutes} dk erken</span>}
                    {r.lateMinutes === 0 && r.earlyLeaveMinutes === 0 && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="max-w-[200px] truncate text-xs text-slate-500">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>Toplam {records.data!.total} kayıt</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Önceki
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sonraki ›
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function AuditTab() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const logs = useQuery({
    queryKey: ["audit-list", { action, page }],
    queryFn: async () =>
      (
        await api.get<{ items: AuditItem[]; total: number }>("/audit-logs", {
          params: { action: action || undefined, page, pageSize },
        })
      ).data,
  });

  const totalPages = Math.max(1, Math.ceil((logs.data?.total ?? 0) / pageSize));

  return (
    <Card>
      <div className="mb-4">
        <select className={inputClass + " md:!w-72"} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">Tüm eylemler</option>
          <option value="ATTENDANCE_CHECK_FAILED">Başarısız doğrulama</option>
          <option value="ATTENDANCE_CHECK_OK">Başarılı doğrulama</option>
          <option value="ATTENDANCE_MANUAL_EDIT">Manuel düzeltme</option>
          <option value="LOGIN_FAILED">Başarısız giriş</option>
          <option value="DEVICE_REGISTERED">Cihaz kaydı</option>
          <option value="DEVICE_APPROVED">Cihaz onayı</option>
          <option value="DEVICE_REVOKED">Cihaz iptali</option>
          <option value="TABLET_PROVISIONED">Tablet kaydı</option>
          <option value="TABLET_CLAIMED">Tablet kurulumu</option>
          <option value="TABLET_AUTH_FAILED">Tablet doğrulama hatası</option>
          <option value="TIMESHEET_APPROVED">Puantaj onayı</option>
        </select>
      </div>
      {logs.isLoading ? (
        <Spinner />
      ) : (logs.data?.items.length ?? 0) === 0 ? (
        <EmptyState message="Denetim kaydı yok." />
      ) : (
        <>
          <ul className="space-y-2">
            {logs.data!.items.map((item) => (
              <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-700">{item.action}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-500">
                  {JSON.stringify(item.detail)}
                </pre>
                <div className="text-xs text-slate-400">
                  Kullanıcı: {item.userId ?? "—"} · IP: {item.ip ?? "—"}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-end gap-2 text-sm text-slate-500">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹ Önceki
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Sonraki ›
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
