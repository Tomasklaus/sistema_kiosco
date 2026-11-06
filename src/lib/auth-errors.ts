export function traducirErrorAuth(msg: string): string {
  if (!msg) return "Ocurrió un error inesperado. Por favor reintentá.";
  const lower = msg.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "Email o contraseña incorrectos. Por favor verificá tus datos.";
  }
  if (lower.includes("user already registered") || lower.includes("already registered")) {
    return "Ya existe una cuenta con este correo electrónico. Probá iniciar sesión.";
  }
  if (lower.includes("password should be at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("email not confirmed")) {
    return "Debés confirmar tu correo electrónico antes de ingresar.";
  }
  if (
    lower.includes("database error") ||
    lower.includes("código de invitación") ||
    lower.includes("invitacion") ||
    lower.includes("inválido")
  ) {
    return "Código de invitación inválido, vencido o ya utilizado.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Demasiados intentos. Por favor esperá unos minutos antes de reintentar.";
  }
  if (lower.includes("network") || lower.includes("fetch failed")) {
    return "Error de conexión. Verificá tu acceso a internet.";
  }
  return msg;
}

