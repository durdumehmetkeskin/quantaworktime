import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Badge, Button, Card, EmptyState, Field, inputClass, Modal, Spinner } from "../components/ui";

interface TabletRow {
  id: string;
  name: string;
  location: string;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface ProvisionResult {
  tabletId: string;
  provisionCode: string;
  expiresAt: string;
}

export function TabletsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tablets = useQuery({
    queryKey: ["tablets"],
    queryFn: async () => (await api.get<TabletRow[]>("/tablets")).data,
    refetchInterval: 30_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["tablets"] });

  const rotate = useMutation({
    mutationFn: async (id: string) => (await api.post<ProvisionResult>(`/tablets/${id}/rotate-secret`)).data,
    onSuccess: (data) => {
      setProvisionResult(data);
      invalidate();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: TabletRow) => api.patch(`/tablets/${t.id}`, { isActive: !t.isActive }),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Tabletler</h1>
        <Button onClick={() => setCreating(true)}>+ Tablet Kaydet</Button>
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
        {tablets.isLoading ? (
          <Spinner />
        ) : (tablets.data?.length ?? 0) === 0 ? (
          <EmptyState message="Kayıtlı tablet yok." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Ad</th>
                <th>Konum</th>
                <th>Çevrimiçi</th>
                <th>Son Görülme</th>
                <th>Durum</th>
                <th className="text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {tablets.data!.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{t.name}</td>
                  <td>{t.location}</td>
                  <td>{t.isOnline ? <Badge tone="green">Çevrimiçi</Badge> : <Badge tone="red">Çevrimdışı</Badge>}</td>
                  <td className="text-slate-500">{formatDateTime(t.lastSeenAt)}</td>
                  <td>{t.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="slate">Pasif</Badge>}</td>
                  <td className="space-x-2 text-right">
                    <Button variant="ghost" onClick={() => rotate.mutate(t.id)}>
                      Secret Rotasyonu
                    </Button>
                    <Button
                      variant="ghost"
                      className={t.isActive ? "!text-rose-600" : "!text-emerald-600"}
                      onClick={() => toggleActive.mutate(t)}
                    >
                      {t.isActive ? "Pasifleştir" : "Aktifleştir"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {creating && (
        <ProvisionModal
          onClose={() => setCreating(false)}
          onProvisioned={(result) => {
            setCreating(false);
            setProvisionResult(result);
            invalidate();
          }}
        />
      )}

      {provisionResult && (
        <Modal title="Kurulum Kodu (yalnızca bir kez gösterilir)" onClose={() => setProvisionResult(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Bu kodu tabletteki kurulum ekranına girin. Kod tek kullanımlıktır ve{" "}
              <strong>{formatDateTime(provisionResult.expiresAt)}</strong> tarihine kadar geçerlidir.
            </p>
            <div className="rounded-lg bg-slate-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-emerald-400">
              {provisionResult.provisionCode}
            </div>
            <p className="text-xs text-slate-400">Tablet ID: {provisionResult.tabletId}</p>
            <div className="flex justify-end">
              <Button onClick={() => setProvisionResult(null)}>Kodu kaydettim, kapat</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProvisionModal({
  onClose,
  onProvisioned,
}: {
  onClose: () => void;
  onProvisioned: (result: ProvisionResult) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ProvisionResult>("/tablets/provision", { name, location });
      onProvisioned(data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Yeni Tablet" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tablet Adı">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Konum">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={name.length < 2 || location.length < 2 || busy} onClick={submit}>
            Kaydet ve Kod Üret
          </Button>
        </div>
      </div>
    </Modal>
  );
}
