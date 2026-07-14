import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, apiErrorMessage } from "../lib/api";
import { formatDateTime, todayStr } from "../lib/format";
import { Badge, Button, Card, EmptyState, Field, inputClass, Modal, Spinner } from "../components/ui";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  employeeCode: string | null;
  department: string | null;
  isActive: boolean;
}

interface DeviceRow {
  id: string;
  userId: string;
  platform: string;
  model: string;
  status: "ACTIVE" | "PENDING_APPROVAL" | "REVOKED";
  registeredAt: string;
  user?: { fullName: string };
}

interface ShiftRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

const userSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin."),
  password: z.string().min(8, "En az 8 karakter.").optional().or(z.literal("")),
  fullName: z.string().min(2, "Ad soyad zorunlu."),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  employeeCode: z.string().optional(),
  department: z.string().optional(),
});
type UserForm = z.infer<typeof userSchema>;

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [assigning, setAssigning] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserRow[]>("/users")).data,
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: async () => (await api.get<DeviceRow[]>("/devices")).data,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const deviceAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "revoke" }) =>
      api.post(`/devices/${id}/${action}`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => api.patch(`/users/${id}`, { isActive: true }),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const pendingDevices = (devices.data ?? []).filter((d) => d.status === "PENDING_APPROVAL");
  const devicesByUser = new Map<string, DeviceRow[]>();
  for (const d of devices.data ?? []) {
    devicesByUser.set(d.userId, [...(devicesByUser.get(d.userId) ?? []), d]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Çalışanlar</h1>
        <Button onClick={() => setEditing("new")}>+ Yeni Çalışan</Button>
      </div>
      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>
            kapat
          </button>
        </div>
      )}

      {pendingDevices.length > 0 && (
        <Card title={`Onay Bekleyen Cihazlar (${pendingDevices.length})`}>
          <ul className="space-y-2">
            {pendingDevices.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{d.user?.fullName ?? d.userId}</span>{" "}
                  <span className="text-slate-500">
                    — {d.platform} / {d.model} · {formatDateTime(d.registeredAt)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => deviceAction.mutate({ id: d.id, action: "approve" })}>Onayla</Button>
                  <Button variant="danger" onClick={() => deviceAction.mutate({ id: d.id, action: "revoke" })}>
                    Reddet
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {users.isLoading ? (
          <Spinner />
        ) : (users.data?.length ?? 0) === 0 ? (
          <EmptyState message="Kayıtlı kullanıcı yok." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Ad Soyad</th>
                <th>Sicil</th>
                <th>Departman</th>
                <th>Rol</th>
                <th>Cihaz</th>
                <th>Durum</th>
                <th className="text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.data!.map((u) => {
                const activeDevice = (devicesByUser.get(u.id) ?? []).find((d) => d.status === "ACTIVE");
                return (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2">
                      <div className="font-medium text-slate-800">{u.fullName}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td>{u.employeeCode ?? "—"}</td>
                    <td>{u.department ?? "—"}</td>
                    <td>
                      <Badge tone={u.role === "ADMIN" ? "indigo" : u.role === "MANAGER" ? "amber" : "slate"}>
                        {u.role === "ADMIN" ? "Yönetici" : u.role === "MANAGER" ? "Müdür" : "Çalışan"}
                      </Badge>
                    </td>
                    <td>
                      {activeDevice ? (
                        <div className="flex items-center gap-2">
                          <Badge tone="green">{activeDevice.model}</Badge>
                          <button
                            className="text-xs text-rose-600 underline"
                            onClick={() => deviceAction.mutate({ id: activeDevice.id, action: "revoke" })}
                          >
                            iptal
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">yok</span>
                      )}
                    </td>
                    <td>{u.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Pasif</Badge>}</td>
                    <td className="space-x-2 text-right">
                      <Button variant="ghost" onClick={() => setAssigning(u)}>
                        Vardiya
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(u)}>
                        Düzenle
                      </Button>
                      {u.isActive ? (
                        <Button variant="ghost" className="!text-rose-600" onClick={() => deactivate.mutate(u.id)}>
                          Pasifleştir
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="!text-emerald-600"
                          onClick={() => activate.mutate(u.id)}
                        >
                          Aktifleştir
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <UserModal
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
      {assigning && <AssignShiftModal user={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: user
      ? {
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          employeeCode: user.employeeCode ?? "",
          department: user.department ?? "",
          password: "",
        }
      : { role: "EMPLOYEE" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload: Record<string, unknown> = {
      email: values.email,
      fullName: values.fullName,
      role: values.role,
      employeeCode: values.employeeCode || undefined,
      department: values.department || undefined,
    };
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, payload);
        // Optional admin password reset — only when the field was filled in.
        if (values.password) {
          await api.post(`/users/${user.id}/password`, { password: values.password });
        }
      } else {
        if (!values.password) {
          setError("Yeni kullanıcı için şifre zorunludur.");
          return;
        }
        await api.post("/users", { ...payload, password: values.password });
      }
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  });

  return (
    <Modal title={user ? "Çalışanı Düzenle" : "Yeni Çalışan"} onClose={onClose}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <Field label="Ad Soyad" error={errors.fullName?.message}>
          <input className={inputClass} {...register("fullName")} />
        </Field>
        <Field label="E-posta" error={errors.email?.message}>
          <input className={inputClass} type="email" {...register("email")} />
        </Field>
        <Field
          label={user ? "Yeni Şifre (değiştirmek için doldurun)" : "Şifre"}
          error={errors.password?.message}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            placeholder={user ? "Boş bırakılırsa değişmez" : ""}
            {...register("password")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sicil No">
            <input className={inputClass} {...register("employeeCode")} />
          </Field>
          <Field label="Departman">
            <input className={inputClass} {...register("department")} />
          </Field>
        </div>
        <Field label="Rol">
          <select className={inputClass} {...register("role")}>
            <option value="EMPLOYEE">Çalışan</option>
            <option value="MANAGER">Müdür</option>
            <option value="ADMIN">Yönetici</option>
          </select>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Kaydet
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignShiftModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());

  const shifts = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await api.get<ShiftRow[]>("/shifts")).data,
  });
  const current = useQuery({
    queryKey: ["user-shifts", user.id],
    queryFn: async () =>
      (
        await api.get<Array<{ id: string; effectiveFrom: string; effectiveTo: string | null; shift: ShiftRow }>>(
          `/shifts/user/${user.id}`,
        )
      ).data,
  });

  const assign = useMutation({
    mutationFn: async () => api.post("/shifts/assign", { userId: user.id, shiftId, effectiveFrom }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-shifts", user.id] });
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  return (
    <Modal title={`Vardiya Ata — ${user.fullName}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Mevcut Atamalar</h4>
          {current.data?.length ? (
            <ul className="space-y-1 text-sm">
              {current.data.map((a) => (
                <li key={a.id} className="rounded bg-slate-50 px-2 py-1">
                  {a.shift?.name} — {a.effectiveFrom} → {a.effectiveTo ?? "devam ediyor"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Atama yok.</p>
          )}
        </div>
        <Field label="Vardiya">
          <select className={inputClass} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Seçin…</option>
            {shifts.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Geçerlilik Başlangıcı">
          <input
            className={inputClass}
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={!shiftId || assign.isPending} onClick={() => assign.mutate()}>
            Ata
          </Button>
        </div>
      </div>
    </Modal>
  );
}
