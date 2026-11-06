"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  Store,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  KeyRound,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  X,
  ShieldCheck,
  Zap,
  Boxes,
  Users,
  MessageCircle,
} from "lucide-react";
import { loginAction, signupAction } from "@/actions/auth";
import { traducirErrorAuth } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";

interface AuthScreenProps {
  initialTab?: "login" | "register";
  initialError?: string;
  initialCodigo?: string;
}

export function AuthScreen({
  initialTab = "login",
  initialError,
  initialCodigo,
}: AuthScreenProps) {
  const [tab, setTab] = useState<"login" | "register">(initialTab);
  const [registerType, setRegisterType] = useState<"owner" | "invite">(
    initialCodigo?.trim() ? "invite" : "owner"
  );

  // Estados de formularios
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regNombre, setRegNombre] = useState("");
  const [regNegocio, setRegNegocio] = useState("");
  const [regCodigo, setRegCodigo] = useState(initialCodigo?.trim().toUpperCase() ?? "");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Estados de feedback
  const [error, setError] = useState<string | null>(
    initialError ? traducirErrorAuth(initialError) : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const invitacionFija = Boolean(initialCodigo?.trim());

  const handleTabChange = (newTab: "login" | "register") => {
    setTab(newTab);
    setError(null);
    setSuccessMessage(null);
    if (typeof window !== "undefined") {
      const targetUrl =
        newTab === "register"
          ? initialCodigo
            ? `/register?codigo=${encodeURIComponent(initialCodigo)}`
            : "/register"
          : "/login";
      window.history.replaceState(null, "", targetUrl);
    }
  };

  const handleLoginSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("email", loginEmail.trim());
    formData.append("password", loginPassword);

    startTransition(async () => {
      const res = await loginAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Email o contraseña incorrectos.");
        return;
      }
      // Redirigir asegurando que las cookies del servidor se apliquen
      window.location.href = "/pos";
    });
  };

  const handleRegisterSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validaciones locales
    if (!regNombre.trim()) {
      setError("Por favor ingresá tu nombre completo.");
      return;
    }

    if (registerType === "owner" && !regNegocio.trim()) {
      setError("Por favor ingresá el nombre de tu kiosco o comercio.");
      return;
    }

    if (registerType === "invite" && !regCodigo.trim()) {
      setError("Por favor ingresá el código de invitación.");
      return;
    }

    if (regPassword.length < 6) {
      setError("La contraseña debe tener un mínimo de 6 caracteres.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError("Las contraseñas no coinciden. Verificalas antes de continuar.");
      return;
    }

    const formData = new FormData();
    formData.append("nombre", regNombre.trim());
    formData.append("email", regEmail.trim());
    formData.append("password", regPassword);
    formData.append("tipo_registro", registerType);
    if (registerType === "owner") {
      formData.append("negocio", regNegocio.trim());
    } else {
      formData.append("codigo", regCodigo.trim().toUpperCase());
    }

    startTransition(async () => {
      const res = await signupAction(formData);
      if (!res.ok) {
        setError(res.error ?? "No se pudo completar el registro.");
        return;
      }

      if (res.requiresEmailConfirmation) {
        setSuccessMessage(
          res.message ??
            "¡Cuenta creada con éxito! Revisá tu correo electrónico para confirmar tu cuenta y luego iniciá sesión."
        );
        return;
      }

      // Registro exitoso con sesión automática
      window.location.href = "/pos";
    });
  };

  const whatsappNum = process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL;

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#0b1020] text-slate-100 overflow-hidden">
      {/* Luces de fondo decorativas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 size-[500px] rounded-full bg-emerald-500/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-40 size-[500px] rounded-full bg-teal-500/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative z-10 w-full max-w-md mx-auto space-y-6">
        {/* Cabecera de Marca */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/20 ring-1 ring-white/20">
            <div className="w-full h-full bg-[#0b1020]/40 rounded-[14px] flex items-center justify-center backdrop-blur-sm">
              <Store className="size-7 text-emerald-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">Kiosco POS</h1>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                v2.0
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {tab === "login"
                ? "Ingresá tus credenciales para acceder al sistema"
                : registerType === "invite"
                ? "Completá tus datos para sumarte al equipo"
                : "Creá tu cuenta y empezá a gestionar tu negocio"}
            </p>
          </div>
        </div>

        {/* Tarjeta Principal */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 sm:p-7 backdrop-blur-xl shadow-2xl space-y-5">
          {/* Selector de pestañas: Log In / Log Up */}
          <div className="grid grid-cols-2 p-1 bg-black/40 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => handleTabChange("login")}
              className={cn(
                "py-2.5 px-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                tab === "login"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <LogIn className="size-4" />
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("register")}
              className={cn(
                "py-2.5 px-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                tab === "register"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <UserPlus className="size-4" />
              Registrarse
            </button>
          </div>

          {/* Banner de Invitación detectada */}
          {invitacionFija && tab === "register" && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs sm:text-sm">
              <Sparkles className="size-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-emerald-300">¡Fuiste invitado a unirte a un negocio!</p>
                <p className="text-emerald-200/90 leading-relaxed">
                  Completá tu nombre, email y contraseña para activar tu usuario en el equipo.
                </p>
              </div>
            </div>
          )}

          {/* Banner de Error */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
              <AlertCircle className="size-5 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-400/80 hover:text-red-200 transition-colors p-0.5 rounded"
                title="Cerrar mensaje"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Banner de Éxito */}
          {successMessage && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* ======================================================== */}
          {/* APARTADO 1: INICIAR SESIÓN (LOG IN)                      */}
          {/* ======================================================== */}
          {tab === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="size-4" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="tunegocio@ejemplo.com"
                    required
                    autoComplete="email"
                    disabled={isPending}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="size-4" />
                  </div>
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    name="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    disabled={isPending}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
                  >
                    {showLoginPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 px-4 rounded-xl font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <span>Iniciando sesión...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar al Sistema</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-slate-400">
                  ¿Todavía no tenés cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => handleTabChange("register")}
                    className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline-offset-4 hover:underline"
                  >
                    Registrate gratis
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* APARTADO 2: CREAR CUENTA (LOG UP)                        */}
          {/* ======================================================== */}
          {tab === "register" && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              {/* Selector de tipo de registro: Nuevo Negocio vs Tengo Código */}
              {!invitacionFija && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-black/30 rounded-xl border border-white/5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setRegisterType("owner")}
                    className={cn(
                      "py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all",
                      registerType === "owner"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Store className="size-3.5" />
                    Crear mi Negocio
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegisterType("invite")}
                    className={cn(
                      "py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all",
                      registerType === "invite"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    <KeyRound className="size-3.5" />
                    Unirme con Código
                  </button>
                </div>
              )}

              {/* Nombre completo */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Tu Nombre y Apellido
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="size-4" />
                  </div>
                  <input
                    type="text"
                    name="nombre"
                    value={regNombre}
                    onChange={(e) => setRegNombre(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    required
                    autoComplete="name"
                    disabled={isPending}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Modo: Dueño de nuevo negocio */}
              {registerType === "owner" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Nombre del Negocio o Kiosco
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Store className="size-4" />
                    </div>
                    <input
                      type="text"
                      name="negocio"
                      value={regNegocio}
                      onChange={(e) => setRegNegocio(e.target.value)}
                      placeholder="Ej: Kiosco Belgrano"
                      required={registerType === "owner"}
                      autoComplete="organization"
                      disabled={isPending}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              {/* Modo: Empleado con código de invitación */}
              {registerType === "invite" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Código de Invitación
                    </label>
                    {invitacionFija && (
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <ShieldCheck className="size-3.5" /> Vinculado por enlace
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="size-4" />
                    </div>
                    <input
                      type="text"
                      name="codigo"
                      value={regCodigo}
                      onChange={(e) => setRegCodigo(e.target.value.toUpperCase())}
                      placeholder="Ej: A1B2C3D4"
                      required={registerType === "invite"}
                      readOnly={invitacionFija}
                      maxLength={12}
                      disabled={isPending}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl border text-white text-sm outline-none uppercase font-mono tracking-wider transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50",
                        invitacionFija
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200 cursor-not-allowed"
                          : "bg-slate-950/70 border-white/10 placeholder:text-slate-500"
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="size-4" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="tunegocio@ejemplo.com"
                    required
                    autoComplete="email"
                    disabled={isPending}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Contraseña (mínimo 6 caracteres)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="size-4" />
                  </div>
                  <input
                    type={showRegPassword ? "text" : "password"}
                    name="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={isPending}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
                  >
                    {showRegPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Contraseña */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="size-4" />
                  </div>
                  <input
                    type={showRegConfirmPassword ? "text" : "password"}
                    name="confirm_password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={isPending}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white placeholder:text-slate-500 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
                  >
                    {showRegConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 px-4 rounded-xl font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <span>Creando tu cuenta...</span>
                  </>
                ) : registerType === "owner" ? (
                  <>
                    <Store className="size-4" />
                    <span>Crear mi Negocio</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    <span>Unirme al Negocio</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-slate-400">
                  ¿Ya tenés una cuenta registrada?{" "}
                  <button
                    type="button"
                    onClick={() => handleTabChange("login")}
                    className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline-offset-4 hover:underline"
                  >
                    Iniciá sesión acá
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Puntos destacados del sistema */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex flex-col items-center gap-1">
            <Zap className="size-4 text-emerald-400" />
            <span className="font-medium text-slate-300">POS Ultrarrápido</span>
            <span className="text-[10px] text-slate-500">Cobros en segundos</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex flex-col items-center gap-1">
            <Boxes className="size-4 text-teal-400" />
            <span className="font-medium text-slate-300">Stock & Precios</span>
            <span className="text-[10px] text-slate-500">Alertas de reposición</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex flex-col items-center gap-1">
            <Users className="size-4 text-cyan-400" />
            <span className="font-medium text-slate-300">Multiusuario</span>
            <span className="text-[10px] text-slate-500">Turnos y cajeros</span>
          </div>
        </div>

        {/* Enlace de soporte / WhatsApp si está configurado */}
        {whatsappNum && (
          <div className="text-center">
            <a
              href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(
                "Hola, necesito ayuda con el acceso a Kiosco POS"
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              ¿Necesitás ayuda con tu cuenta? Contactar soporte
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

