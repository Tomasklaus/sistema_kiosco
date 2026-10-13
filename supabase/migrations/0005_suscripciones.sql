-- Tabla para almacenar el estado de la suscripción del negocio/usuario
CREATE TABLE IF NOT EXISTS public.suscripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    estado TEXT NOT NULL DEFAULT 'inactiva' CHECK (estado IN ('activa', 'inactiva', 'pendiente', 'cancelada')),
    proveedor TEXT CHECK (proveedor IN ('mercadopago', 'paypal', 'manual')),
    proveedor_suscripcion_id TEXT,
    plan TEXT NOT NULL DEFAULT 'mensual',
    precio NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    fecha_inicio TIMESTAMPTZ,
    fecha_fin TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Asegurar que un usuario solo tenga un registro de suscripción principal (opcional, pero útil si se maneja 1:1)
CREATE UNIQUE INDEX IF NOT EXISTS un_usuario_suscripcion ON public.suscripciones(usuario_id);

-- Tabla para guardar el historial de pagos de las suscripciones (opcional pero recomendado)
CREATE TABLE IF NOT EXISTS public.historial_pagos_suscripcion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suscripcion_id UUID NOT NULL REFERENCES public.suscripciones(id) ON DELETE CASCADE,
    proveedor_pago_id TEXT,
    monto NUMERIC(10,2) NOT NULL,
    moneda TEXT NOT NULL,
    estado TEXT NOT NULL,
    fecha_pago TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas RLS para suscripciones
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_pagos_suscripcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver su propia suscripcion" ON public.suscripciones
    FOR SELECT USING (auth.uid() = usuario_id);

-- Trigger para actualizar `updated_at`
CREATE TRIGGER update_suscripciones_modtime
BEFORE UPDATE ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Insertar suscripción inactiva por defecto al crear usuario (Opcional, podemos hacerlo desde código)
