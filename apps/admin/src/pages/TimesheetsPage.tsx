import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { currentMonth, formatMinutes, formatTime, WEEKDAY_LABELS } from "../lib/format";
import { Badge, Button, Card, Field, inputClass, Modal, Spinner } from "../components/ui";

interface TimesheetRow {
  id: string;
  userId: string;
  fullName: string;
  employeeCode: string | null;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  absentDays: number;
  status: "DRAFT" | "APPROVED";
}

interface RecordRow {
  id: string;
  userId: string;
  userFullName: string;
  type: "IN" | "OUT";
  timestamp: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isManual: boolean;
  note: string | null;
}

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function istanbulDay(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
}

export function TimesheetsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [cell, setCell] = useState<{ userId: string; fullName: string; day: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timesheets = useQuery({
    queryKey: ["timesheets", month],
    queryFn: async () => (await api.get<TimesheetRow[]>(`/timesheets/${month}`)).data,
  });

  const records = useQuery({
    queryKey: ["attendance", month],
    queryFn: async () => {
      const from = `${month}-01T00:00:00+03:00`;
      const [y, m] = month.split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const to = `${next}-01T00:00:00+03:00`;
      return (
        await api.get<{ items: RecordRow[] }>("/attendance", { params: { from, to, pageSize: 2000 } })
      ).data.items;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["timesheets", month] });
    void queryClient.invalidateQueries({ queryKey: ["attendance", month] });
  };

  const generate = useMutation({
    mutationFn: async () => api.post(`/timesheets/${month}/generate`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/timesheets/${id}/approve`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const downloadXlsx = async () => {
    const response = await api.get(`/reports/monthly/export`, {
      params: { month },
      responseType: "blob",
    });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `puantaj-${month}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const days = useMemo(() => daysOfMonth(month), [month]);
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, RecordRow[]>>();
    for (const record of records.data ?? []) {
      const day = istanbulDay(record.timestamp);
      const userMap = map.get(record.userId) ?? new Map<string, RecordRow[]>();
      userMap.set(day, [...(userMap.get(day) ?? []), record]);
      map.set(record.userId, userMap);
    }
    return map;
  }, [records.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Puantaj</h1>
        <div className="flex items-center gap-2">
          <input className={inputClass + " !w-40"} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? "Hesaplanıyor…" : "Yeniden Hesapla"}
          </Button>
          <Button onClick={downloadXlsx}>Excel İndir</Button>
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>
            kapat
          </button>
        </div>
      )}

      <Card>
        {timesheets.isLoading || records.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b bg-white px-2 py-2 text-left font-semibold">Çalışan</th>
                  {days.map((d) => {
                    const dayNum = d.slice(8);
                    const weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
                    return (
                      <th
                        key={d}
                        className={`border-b px-1 py-2 text-center font-medium ${weekday >= 5 ? "bg-slate-50 text-slate-400" : "text-slate-600"}`}
                      >
                        <div>{dayNum}</div>
                        <div className="text-[10px] font-normal">{WEEKDAY_LABELS[weekday]}</div>
                      </th>
                    );
                  })}
                  <th className="border-b px-2 py-2 text-right">Çalışma</th>
                  <th className="border-b px-2 py-2 text-right">Geç</th>
                  <th className="border-b px-2 py-2 text-right">F.Mesai</th>
                  <th className="border-b px-2 py-2 text-right">Devamsız</th>
                  <th className="border-b px-2 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {(timesheets.data ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-slate-800">
                      {t.fullName}
                      <span className="ml-1 text-[10px] text-slate-400">{t.employeeCode}</span>
                    </td>
                    {days.map((d) => {
                      const dayRecords = grid.get(t.userId)?.get(d) ?? [];
                      const firstIn = dayRecords.find((r) => r.type === "IN");
                      const lastOut = [...dayRecords].reverse().find((r) => r.type === "OUT");
                      const hasLate = dayRecords.some((r) => r.lateMinutes > 0);
                      const hasManual = dayRecords.some((r) => r.isManual);
                      return (
                        <td
                          key={d}
                          className={`cursor-pointer px-1 py-1 text-center align-middle hover:bg-indigo-50 ${
                            hasLate ? "bg-amber-50" : hasManual ? "bg-sky-50" : ""
                          }`}
                          title={`${t.fullName} — ${d}`}
                          onClick={() =>
                            dayRecords.length > 0 && setCell({ userId: t.userId, fullName: t.fullName, day: d })
                          }
                        >
                          {dayRecords.length === 0 ? (
                            <span className="text-slate-200">·</span>
                          ) : (
                            <div className="leading-tight">
                              <div className="text-emerald-700">{firstIn ? formatTime(firstIn.timestamp) : "—"}</div>
                              <div className="text-rose-600">{lastOut ? formatTime(lastOut.timestamp) : "—"}</div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 text-right font-medium">{formatMinutes(t.totalWorkedMinutes)}</td>
                    <td className="px-2 text-right text-amber-700">{formatMinutes(t.totalLateMinutes)}</td>
                    <td className="px-2 text-right text-indigo-700">{formatMinutes(t.totalOvertimeMinutes)}</td>
                    <td className="px-2 text-right">{t.absentDays}</td>
                    <td className="px-2 text-center">
                      {t.status === "APPROVED" ? (
                        <Badge tone="green">Onaylı</Badge>
                      ) : (
                        <Button variant="ghost" onClick={() => approve.mutate(t.id)}>
                          Onayla
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(timesheets.data?.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">
                Bu ay için puantaj yok. "Yeniden Hesapla" ile oluşturabilirsiniz.
              </p>
            )}
          </div>
        )}
      </Card>

      {cell && (
        <CellEditModal
          cell={cell}
          records={(grid.get(cell.userId)?.get(cell.day) ?? []).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp),
          )}
          onClose={() => setCell(null)}
          onSaved={() => {
            setCell(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function CellEditModal({
  cell,
  records,
  onClose,
  onSaved,
}: {
  cell: { userId: string; fullName: string; day: string };
  records: RecordRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEdit = (record: RecordRow) => {
    setEditingId(record.id);
    setType(record.type);
    setNote(record.note ?? "");
    setTime(
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(record.timestamp)),
    );
  };

  const save = async () => {
    if (!editingId) return;
    setError(null);
    try {
      await api.patch(`/attendance/${editingId}`, {
        timestamp: `${cell.day}T${time}:00+03:00`,
        type,
        note,
      });
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <Modal title={`${cell.fullName} — ${cell.day}`} onClose={onClose}>
      <div className="space-y-3">
        {records.map((record) => (
          <div key={record.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <Badge tone={record.type === "IN" ? "green" : "red"}>
                  {record.type === "IN" ? "Giriş" : "Çıkış"}
                </Badge>{" "}
                <span className="font-medium">{formatTime(record.timestamp)}</span>
                {record.isManual && <Badge tone="indigo">Manuel</Badge>}
                {record.lateMinutes > 0 && (
                  <span className="ml-1 text-xs text-amber-600">+{record.lateMinutes} dk geç</span>
                )}
              </div>
              <Button variant="ghost" onClick={() => startEdit(record)}>
                Düzelt
              </Button>
            </div>
            {record.note && <p className="mt-1 text-xs text-slate-500">Not: {record.note}</p>}
            {editingId === record.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Saat (İstanbul)">
                    <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                  <Field label="Tip">
                    <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as "IN" | "OUT")}>
                      <option value="IN">Giriş</option>
                      <option value="OUT">Çıkış</option>
                    </select>
                  </Field>
                </div>
                <Field label="Düzeltme Notu (zorunlu)">
                  <input
                    className={inputClass}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Neden düzeltildi?"
                  />
                </Field>
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditingId(null)}>
                    Vazgeç
                  </Button>
                  <Button disabled={note.length < 3} onClick={save}>
                    Kaydet
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
