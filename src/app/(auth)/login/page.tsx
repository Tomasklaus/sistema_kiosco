import { login, signup } from "@/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; codigo?: string }> }) {
  const { error, codigo } = await searchParams;
  const campo = "w-full rounded-lg bg-white/10 p-2 text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-emerald-400";
  return (
    <main className="min-h-screen grid place-items-center bg-slate-950 p-4">
      <form className="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h1 className="text-2xl font-bold text-white">Kiosco POS</h1>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input name="email" type="email" placeholder="Email" required className={campo} />
        <input name="password" type="password" placeholder="Contraseña" required minLength={6} className={campo} />

        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Solo para registrarte</p>
          <input name="nombre" placeholder="Tu nombre" className={campo} />
          <input name="negocio" placeholder="Nombre de tu negocio (si creás uno nuevo)" className={campo} />
          <input name="codigo" defaultValue={codigo ?? ""} placeholder="Código de invitación (si te sumás a un negocio)"
            className={`${campo} uppercase`} />
        </div>

        <div className="flex gap-2">
          <button formAction={login} className="flex-1 rounded-lg bg-emerald-500 p-2 font-semibold text-white">Ingresar</button>
          <button formAction={signup} className="flex-1 rounded-lg border border-white/20 p-2 text-white">Registrarme</button>
        </div>
        {codigo && <p className="text-xs text-emerald-300">Te invitaron a un negocio: completá tus datos y tocá Registrarme.</p>}
      </form>
    </main>
  );
}
