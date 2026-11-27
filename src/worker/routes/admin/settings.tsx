import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  Settings,
  type AdminsNotice,
  type GooglePanel,
} from "../../../pages/admin/Settings";
import {
  grantAdmin,
  listAdmins,
  revokeAdmin,
  type Account,
} from "../../accounts";
import { emailPattern } from "../../form";
import { deleteAccount, findAccount, saveAccount } from "../../google/account";
import { authUrl, credentials, exchangeCode, revoke } from "../../google/oauth";
import { newToken } from "../../tokens";
import { notFound, site, type AppEnv, type Ctx, type Deps } from "../../web";
import { whatsappMode } from "../../whatsapp";
import { adminPage, pick } from "./page";

const GOOGLE_STATE_COOKIE = "up_google_state";

const googleNotices = ["conectado", "desconectado", "error"] as const;
const adminsNotices: readonly AdminsNotice[] = ["agregado", "quitado"];

/** /admin/ajustes: the admins, the Google connection and the WhatsApp mode. */
export function settingsRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const secure = (c: Ctx) => c.env.SITE_URL.startsWith("https:");
  const googleReturn = (c: Ctx) => `${site(c)}/admin/google/vuelta`;
  const signedIn = (c: Ctx) => c.get("admin") as Account;

  const settings = async (
    c: Ctx,
    form: { email: string; error?: string } = { email: "" },
    status = 200,
  ) => {
    const google: GooglePanel | undefined = credentials(c.env)
      ? {
          account: (await findAccount(c.var.db))?.email,
          notice: pick(googleNotices, c.req.query("google")),
        }
      : undefined;

    return adminPage(
      c,
      "Ajustes",
      <Settings
        admins={{
          admins: await listAdmins(c.var.db),
          selfId: signedIn(c).id,
          notice: pick(adminsNotices, c.req.query("admins")),
          ...form,
        }}
        google={google}
        whatsapp={whatsappMode(c.env)}
      />,
      { status, section: "ajustes" },
    );
  };

  routes.get("/ajustes", (c) => settings(c));

  routes.get("/google/conectar", (c) => {
    const creds = credentials(c.env);
    if (!creds) return notFound(c);

    const state = newToken();
    setCookie(c, GOOGLE_STATE_COOKIE, state, {
      path: "/admin/google",
      httpOnly: true,
      sameSite: "Lax",
      secure: secure(c),
      maxAge: 10 * 60,
    });
    return c.redirect(authUrl(creds, googleReturn(c), state), 302);
  });

  routes.get("/google/vuelta", async (c) => {
    const creds = credentials(c.env);
    if (!creds) return notFound(c);

    const expected = getCookie(c, GOOGLE_STATE_COOKIE);
    deleteCookie(c, GOOGLE_STATE_COOKIE, { path: "/admin/google" });
    const code = c.req.query("code");
    if (!code || !expected || c.req.query("state") !== expected)
      return c.redirect("/admin/ajustes?google=error", 303);

    try {
      const granted = await exchangeCode(fetcher, creds, code, googleReturn(c));
      await saveAccount(c.var.db, {
        ...granted,
        connectedBy: signedIn(c).id,
        connectedAt: iso(),
      });
      return c.redirect("/admin/ajustes?google=conectado", 303);
    } catch (error) {
      console.error(error);
      return c.redirect("/admin/ajustes?google=error", 303);
    }
  });

  routes.post("/google/desconectar", async (c) => {
    const account = await findAccount(c.var.db);
    if (account) {
      await revoke(fetcher, account.refreshToken).catch(console.error);
      await deleteAccount(c.var.db);
    }
    return c.redirect("/admin/ajustes?google=desconectado", 303);
  });

  routes.post("/admins", async (c) => {
    const email = String((await c.req.formData()).get("email") ?? "")
      .trim()
      .toLowerCase();
    const change = emailPattern.test(email)
      ? await grantAdmin(c.var.db, email, iso())
      : null;

    if (change === "done")
      return c.redirect("/admin/ajustes?admins=agregado#admins-title", 303);

    const error = change
      ? "Esa persona aún no tiene cuenta. Pídele que entre en /entrar con ese correo."
      : "Escribe un correo válido.";
    return settings(c, { email, error }, 422);
  });

  routes.post("/admins/:id/quitar", async (c) => {
    await revokeAdmin(c.var.db, signedIn(c), c.req.param("id"), iso());
    return c.redirect("/admin/ajustes?admins=quitado#admins-title", 303);
  });

  return routes;
}
