import type { Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { USUARIO_DEMO } from "./datos-demo";

const BASE = "https://localhost";
const DESTINO = path.join(process.cwd(), "public", "guia");

type Ids = { web: string; api: string; tienda: string; intranet: string };

type Paso = {
  nombre: string;
  // Absent: stay on the page the previous step left (multi-step flows).
  ruta?: (ids: Ids) => string;
  preparar?: (page: Page) => Promise<void>;
  // Element to capture; whole page when absent.
  elemento?: (page: Page) => Locator;
};

async function abrir(page: Page, ruta: string): Promise<void> {
  // Traefik may still be picking up the panel right after it turns healthy.
  for (let intento = 0; ; intento++) {
    const res = await page
      .goto(BASE + ruta, { waitUntil: "networkidle" })
      .catch(() => null);
    if (res && res.status() < 400) return;
    if (intento >= 10) throw new Error(`${ruta} respondió ${res?.status()}`);
    await page.waitForTimeout(2000);
  }
}

export async function entrar(page: Page): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });
  await page.addInitScript(() =>
    localStorage.setItem("vicalba-theme", "light"),
  );
  await abrir(page, "/login");
  await page.screenshot({ path: path.join(DESTINO, "login.png") });
  await page.getByLabel("Email").fill(USUARIO_DEMO.email);
  await page.getByLabel("Contraseña").fill(USUARIO_DEMO.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(BASE + "/");
}

// The client and project forms are plain overlays: capture the box around the title.
const caja = (page: Page, titulo: string) =>
  page.getByRole("heading", { name: titulo }).locator("xpath=..");

const tarjeta = (page: Page, titulo: string) =>
  page.locator("section", {
    has: page.getByRole("heading", { name: titulo }),
  });

const seccionCliente = (page: Page, cliente: string) =>
  page.getByRole("region", { name: cliente });

async function idDe(page: Page, cliente: string, proyecto: string) {
  const href = await seccionCliente(page, cliente)
    // The link's name starts with the status badge ("running web").
    .getByRole("link", { name: new RegExp(`(^|\\s)${proyecto}$`) })
    .first()
    .getAttribute("href");
  if (!href) throw new Error(`No encuentro ${cliente} / ${proyecto}`);
  return href.split("/").pop()!;
}

const PASOS: Paso[] = [
  { nombre: "dashboard", ruta: () => "/" },
  {
    nombre: "busqueda",
    ruta: () => "/",
    preparar: async (page) => {
      await page.keyboard.press("Control+k");
      await page.getByLabel("Buscar proyecto o página").fill("tienda");
    },
    elemento: (page) => page.getByRole("dialog", { name: "Buscar" }),
  },
  { nombre: "proyectos", ruta: () => "/proyectos" },
  {
    nombre: "cliente-nuevo",
    ruta: () => "/proyectos",
    preparar: async (page) => {
      await page.getByRole("button", { name: "Nuevo cliente" }).click();
      await page.getByLabel("Nombre").fill("Panadería Sol");
    },
    elemento: (page) => caja(page, "Nuevo cliente"),
  },
  {
    nombre: "proyecto-nuevo",
    ruta: () => "/proyectos",
    preparar: async (page) => {
      await seccionCliente(page, "ACME Logística")
        .getByRole("button", { name: "+ Proyecto" })
        .click();
      await page.getByLabel("Nombre").fill("docs");
      await page
        .getByLabel(/Repositorio GitHub/)
        .fill("git@github.com:acme/docs.git");
    },
    elemento: (page) => caja(page, "Nuevo proyecto"),
  },
  {
    nombre: "proyecto-tipo-nodejs",
    ruta: () => "/proyectos",
    preparar: async (page) => {
      await seccionCliente(page, "ACME Logística")
        .getByRole("button", { name: "+ Proyecto" })
        .click();
      await page.getByLabel("Nombre").fill("panel-clientes");
      await page.locator("#tipo").click();
      await page.getByRole("option", { name: "Node.js" }).click();
    },
    elemento: (page) => caja(page, "Nuevo proyecto"),
  },
  { nombre: "proyecto-resumen", ruta: (ids) => `/proyectos/${ids.web}` },
  {
    nombre: "proyecto-deploys",
    ruta: (ids) => `/proyectos/${ids.web}?tab=deploys`,
    preparar: async (page) => {
      await page.getByText("Ver output").first().click();
    },
  },
  {
    nombre: "proyecto-deploy-error",
    ruta: (ids) => `/proyectos/${ids.api}?tab=deploys`,
  },
  {
    nombre: "proyecto-variables",
    ruta: (ids) => `/proyectos/${ids.web}?tab=variables`,
  },
  {
    nombre: "proyecto-variables-editor",
    ruta: (ids) => `/proyectos/${ids.web}?tab=variables`,
    preparar: async (page) => {
      await page.getByRole("button", { name: "Editar variables" }).click();
      await page.locator(".monaco-editor").first().waitFor();
      await page.waitForTimeout(1000);
    },
  },
  {
    nombre: "proyecto-logs",
    ruta: (ids) => `/proyectos/${ids.tienda}?tab=logs`,
    preparar: async (page) => {
      await page.waitForTimeout(6000);
    },
  },
  {
    nombre: "proyecto-volumenes",
    ruta: (ids) => `/proyectos/${ids.web}?tab=volumenes`,
  },
  {
    nombre: "explorador-volumen",
    ruta: (ids) => `/proyectos/${ids.web}?tab=volumenes`,
    preparar: async (page) => {
      await page
        .getByRole("button", { name: "Explorar ficheros de uploads" })
        .click();
      await page.getByText("catalogo.csv").waitFor();
    },
    // No dialog role or title: the window is the overlay's only child.
    elemento: (page) => page.locator("div.fixed.inset-0 > div").first(),
  },
  {
    nombre: "proyecto-compose",
    ruta: (ids) => `/proyectos/${ids.intranet}?tab=compose`,
    preparar: async (page) => {
      await page.locator(".monaco-editor").first().waitFor();
      await page.waitForTimeout(1000);
    },
  },
  {
    nombre: "proyecto-zona-peligrosa",
    ruta: (ids) => `/proyectos/${ids.web}?tab=ajustes`,
    elemento: (page) => tarjeta(page, "Zona peligrosa"),
  },
  {
    nombre: "config-notificaciones",
    ruta: () => "/configuracion?seccion=notificaciones",
  },
  { nombre: "config-deploys", ruta: () => "/configuracion?seccion=deploys" },
  {
    nombre: "config-credenciales",
    ruta: () => "/configuracion?seccion=credenciales",
  },
  { nombre: "config-webhook", ruta: () => "/configuracion?seccion=webhook" },
  { nombre: "config-sistema", ruta: () => "/configuracion?seccion=sistema" },
  {
    nombre: "backups-destino",
    ruta: () => "/configuracion?seccion=backups",
    preparar: async (page) => {
      await page.getByRole("button", { name: "SFTP" }).click();
      await page.getByLabel("Host").fill("vicalba-guia-sftp");
      await page.getByLabel("Puerto").fill("2222");
      await page.getByLabel("Usuario").fill("copias");
      await page.getByLabel("Ruta").fill("/config/copias");
      await page.getByRole("button", { name: /credencial ssh/i }).click();
      await page.getByRole("option", { name: "Servidor de copias" }).click();
    },
    elemento: (page) => tarjeta(page, "Destino"),
  },
  {
    nombre: "backups-kit",
    preparar: async (page) => {
      await page.getByRole("button", { name: "Probar y guardar" }).click();
      await page.getByRole("dialog").waitFor({ timeout: 60_000 });
    },
    elemento: (page) => page.getByRole("dialog"),
  },
  {
    nombre: "backups-estado",
    preparar: async (page) => {
      await page.getByLabel("He guardado el kit fuera de la VPS").check();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      await page.getByRole("switch", { name: "Copia diaria" }).click();
      await page.getByText("Programación guardada").waitFor();
      const correctas = await page.getByText("Correcta").count();
      await page.getByRole("button", { name: "Hacer copia ahora" }).click();
      // The section refreshes itself while the copy runs.
      await page.waitForFunction(
        (antes) =>
          [...document.querySelectorAll("td span")].filter(
            (e) => e.textContent === "Correcta",
          ).length > antes,
        correctas,
        { timeout: 120_000 },
      );
      await page.waitForTimeout(3500);
    },
  },
  {
    nombre: "backups-copias",
    elemento: (page) => tarjeta(page, "Copias disponibles"),
  },
  {
    nombre: "backups-restaurar",
    preparar: async (page) => {
      await tarjeta(page, "Copias disponibles")
        .getByRole("button", { name: "Restaurar" })
        .first()
        .click();
      await page
        .getByLabel("Escribe RESTAURAR para confirmar")
        .fill("RESTAURAR");
    },
    elemento: (page) => page.getByRole("dialog"),
  },
  { nombre: "usuarios", ruta: () => "/usuarios" },
  { nombre: "novedades", ruta: () => "/novedades" },
];

// Content scrolls inside <main>, not the page: grow the window to fit it.
async function paginaEntera(page: Page, fichero: string): Promise<void> {
  const alto = await page
    .locator("main")
    .evaluate((m) => m.scrollHeight)
    .catch(() => 900);
  await page.setViewportSize({ width: 1440, height: Math.max(900, alto) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: fichero });
  await page.setViewportSize({ width: 1440, height: 900 });
}

export async function capturar(page: Page): Promise<void> {
  await abrir(page, "/proyectos");
  const ids: Ids = {
    web: await idDe(page, "ACME Logística", "web"),
    api: await idDe(page, "ACME Logística", "api"),
    tienda: await idDe(page, "Tienda Mari", "tienda"),
    intranet: await idDe(page, "Estudio Norte", "intranet"),
  };
  for (const paso of PASOS) {
    if (paso.ruta) await abrir(page, paso.ruta(ids));
    await paso.preparar?.(page);
    const fichero = path.join(DESTINO, `${paso.nombre}.png`);
    if (paso.elemento) await paso.elemento(page).screenshot({ path: fichero });
    else await paginaEntera(page, fichero);
    console.log(`  ✓ ${paso.nombre}`);
  }
}

export async function imprimirPdf(page: Page): Promise<void> {
  await abrir(page, "/guia");
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.join(DESTINO, "guia-usuario.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font-size:8px;width:100%;text-align:center;color:#666">Guía de uso — vicalba-app · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
}
