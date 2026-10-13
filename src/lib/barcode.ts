/** Utilidades para códigos de barras (lector HID, cámara y etiquetas). */

/** Limpia espacios/caracteres de control que algunos lectores agregan. */
export function normalizarCodigo(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f\s]/g, "").trim();
}

/**
 * Compara dos códigos tolerando el cero inicial entre UPC-A (12) y EAN-13 (13),
 * que es lo que distintos lectores devuelven para el mismo producto.
 */
export function mismoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizarCodigo(a);
  const y = normalizarCodigo(b);
  if (x === y) return true;
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
    return x.replace(/^0+/, "") === y.replace(/^0+/, "");
  }
  return false;
}

export function buscarPorCodigo<T extends { codigo_barras: string | null }>(lista: T[], code: string): T | undefined {
  return lista.find((p) => mismoCodigo(p.codigo_barras, code));
}

/** Dígito verificador EAN-13 para los primeros 12 dígitos. */
export function digitoVerificadorEAN13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

export function esEAN13Valido(code: string): boolean {
  return /^\d{13}$/.test(code) && digitoVerificadorEAN13(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Genera un EAN-13 de uso interno (prefijo 20-29, reservado por GS1 para uso en tienda),
 * para productos sin código propio (granel, panadería, fiambrería...).
 */
export function generarCodigoInterno(existentes: Iterable<string | null> = []): string {
  const usados = new Set<string>();
  for (const c of existentes) if (c) usados.add(c);
  for (let intento = 0; intento < 50; intento++) {
    let base = "20";
    for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
    const code = base + digitoVerificadorEAN13(base);
    if (!usados.has(code)) return code;
  }
  return "20" + String(Date.now()).slice(-10) + digitoVerificadorEAN13("20" + String(Date.now()).slice(-10));
}

/* ------------------------------ Sonidos ------------------------------ */

let audioCtx: AudioContext | null = null;

function tono(freq: number, dur: number, inicio = 0, tipo: OscillatorType = "square", vol = 0.08) {
  try {
    audioCtx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime + inicio;
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* sin audio disponible: se ignora */
  }
}

/** "Bip" corto de lectura correcta. */
export function beepOk() { tono(1800, 0.09); }
/** Doble tono grave: código no encontrado. */
export function beepError() { tono(300, 0.14, 0, "sawtooth", 0.1); tono(220, 0.2, 0.16, "sawtooth", 0.1); }

/* ------------------------- Etiquetas imprimibles ------------------------- */

export type EtiquetaProducto = { nombre: string; codigo: string; precio?: number };

/**
 * Abre una ventana de impresión con una grilla de etiquetas (nombre, precio y código de barras).
 * Usa EAN-13 cuando el código es válido y CODE128 en cualquier otro caso.
 */
export async function imprimirEtiquetas(etiquetas: EtiquetaProducto[]): Promise<boolean> {
  if (!etiquetas.length) return false;
  const { default: JsBarcode } = await import("jsbarcode");

  const celdas = etiquetas.map((e) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, e.codigo, {
        format: esEAN13Valido(e.codigo) ? "EAN13" : "CODE128",
        width: 2, height: 56, fontSize: 14, margin: 4, displayValue: true,
      });
    } catch {
      return "";
    }
    const precio = e.precio != null
      ? `<div class="p">$ ${e.precio.toLocaleString("es-AR")}</div>` : "";
    const nombre = e.nombre.replace(/[<>&]/g, "");
    return `<div class="e"><div class="n">${nombre}</div>${svg.outerHTML}${precio}</div>`;
  }).join("");

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;margin:8mm}
  .g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
  .e{border:1px dashed #999;padding:3mm;text-align:center;break-inside:avoid}
  .n{font-size:12px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .p{font-size:18px;font-weight:800;margin-top:1mm}
  svg{max-width:100%;height:auto}
  @media print{body{margin:0}}
</style></head><body><div class="g">${celdas}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
  w.document.close();
  return true;
}
