import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { WEEKDAY_LABELS } from "../lib/format";
import { Badge, Button, Card, EmptyState, Field, inputClass, Modal, Spinner } from "../components/ui";

interface ShiftRow {
  id: string;
  name: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  graceMinutes: number;
  workDays: number; // bitmask, bit 0 = Monday
  breakMinutes: number;
}

const WEEKDAY_FULL = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function workDaysLabel(mask: number): string {
  const days = WEEKDAY_LABELS.filter((_, i) => (mask & (1 << i)) !== 0);
  if (days.length === 0) return "—";
  if (mask === 0b0011111) return "Hafta içi";
  if (mask === 0b1111111) return "Her gün";
  return days.join(", ");
}

export function ShiftsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ShiftRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shifts = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await api.get<ShiftRow[]>("/shifts")).data,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["shifts"] });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Vardiyalar</h1>
          <p className="text-sm text-slate-500">
            Çalışanlara vardiya atamak için Çalışanlar sayfasındaki "Vardiya" düğmesini kullanın.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>+ Yeni Vardiya</Button>
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
        {shifts.isLoading ? (
          <Spinner />
        ) : (shifts.data?.length ?? 0) === 0 ? (
          <EmptyState message="Henüz vardiya tanımlanmadı." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Ad</th>
                <th>Çalışma Saatleri</th>
                <th>Günler</th>
                <th>Tolerans</th>
                <th>Mola</th>
                <th className="text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {shifts.data!.map((s) => {
                const overnight = s.endTime <= s.startTime;
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{s.name}</td>
                    <td>
                      {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                      {overnight && (
                        <span className="ml-1">
                          <Badge tone="indigo">gece</Badge>
                        </span>
                      )}
                    </td>
                    <td>{workDaysLabel(s.workDays)}</td>
                    <td>{s.graceMinutes} dk</td>
                    <td>{s.breakMinutes} dk</td>
                    <td className="space-x-2 text-right">
                      <Button variant="ghost" onClick={() => setEditing(s)}>
                        Düzenle
                      </Button>
                      <Button variant="ghost" className="!text-rose-600" onClick={() => remove.mutate(s.id)}>
                        Sil
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <ShiftModal
          shift={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function ShiftModal({
  shift,
  onClose,
  onSaved,
}: {
  shift: ShiftRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(shift?.name ?? "");
  const [startTime, setStartTime] = useState(shift?.startTime.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(shift?.endTime.slice(0, 5) ?? "18:00");
  const [graceMinutes, setGraceMinutes] = useState(shift?.graceMinutes ?? 10);
  const [breakMinutes, setBreakMinutes] = useState(shift?.breakMinutes ?? 60);
  const [workDays, setWorkDays] = useState(shift?.workDays ?? 0b0011111);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleDay = (i: number) => setWorkDays((mask) => mask ^ (1 << i));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = { name, startTime, endTime, graceMinutes, breakMinutes, workDays };
    try {
      if (shift) await api.patch(`/shifts/${shift.id}`, payload);
      else await api.post("/shifts", payload);
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={shift ? "Vardiyayı Düzenle" : "Yeni Vardiya"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Vardiya Adı">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlangıç Saati">
            <input className={inputClass} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Bitiş Saati">
            <input className={inputClass} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        {endTime <= startTime && (
          <p className="text-xs text-indigo-600">
            Bitiş, başlangıçtan önce: gece vardiyası olarak değerlendirilir (ertesi güne sarkar).
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Geç Kalma Toleransı (dk)">
            <input
              className={inputClass}
              type="number"
              min={0}
              max={120}
              value={graceMinutes}
              onChange={(e) => setGraceMinutes(parseInt(e.target.value || "0", 10))}
            />
          </Field>
          <Field label="Mola Süresi (dk)">
            <input
              className={inputClass}
              type="number"
              min={0}
              max={240}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(parseInt(e.target.value || "0", 10))}
            />
          </Field>
        </div>
        <Field label="Çalışma Günleri">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_FULL.map((day, i) => {
              const active = (workDays & (1 << i)) !== 0;
              return (
                <button
                  key={day}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  onClick={() => toggleDay(i)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={name.length < 2 || workDays === 0 || busy} onClick={submit}>
            Kaydet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
