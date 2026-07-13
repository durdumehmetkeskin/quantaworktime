import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, inputClass } from "../components/ui";

const schema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalıdır."),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error && !("response" in err) ? err.message : apiErrorMessage(err));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src="/logo-full.png" alt="Quanta Kompozit A.Ş." className="mx-auto mb-2 h-24 object-contain" />
          <div className="text-sm text-slate-500">Mesai Yönetimi Paneli</div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="E-posta" error={errors.email?.message}>
            <input className={inputClass} type="email" autoComplete="username" {...register("email")} />
          </Field>
          <Field label="Şifre" error={errors.password?.message}>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button className="w-full py-2" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Giriş yapılıyor…" : "Giriş Yap"}
          </Button>
        </form>
      </div>
    </div>
  );
}
