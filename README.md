# mineflayer-cp

Run idle Minecraft accounts as headless [mineflayer](https://github.com/PrismarineJS/mineflayer) bots on Kubernetes, one pod per account, controlled from a web panel and a per-account MCP endpoint.

```
browser / MCP client
        |
   [ panel ]   Nuxt + Nuxt UI, SQLite on one PVC
        |      creates one Deployment + Service per account, proxies to them
        v
   [ bot ] x N   stateless; mineflayer + viewer + inventory + MCP server
```

- **Panel** (`apps/panel`): account list, start/stop/restart, live console and chat, 3D viewer, inventory, behaviour settings, scripts.
- **Bot** (`apps/bot`): one account per process. Fetches its config from the panel and stores its Microsoft sign-in through the panel, so pods need no volume.
- **Shared** (`packages/shared`): zod schemas used by both.
- **Chart** (`charts/mineflayer-cp`): panel, PVC, RBAC, Secret, optional Ingress / HTTPRoute / NetworkPolicy.

## Behaviours

Per account, changed live from the panel or over MCP: auto eat, anti AFK, auto reconnect with backoff, auto respawn, log out on low health, auto armor, 3D viewer, inventory view.

## Microsoft sign-in

Add an account with its Microsoft email. On first start the account page shows a device code and a link; sign in once. The tokens are stored encrypted (AES-256-GCM) in the panel database and renewed by the bot on later starts. "Forget sign-in" clears them.

## MCP

Each account is served at `https://<panel>/mcp/<account-id>` (Streamable HTTP) and requires `Authorization: Bearer <mcpToken>`.

```bash
claude mcp add --transport http minecraft-alt1 https://<panel>/mcp/alt-1 --header "Authorization: Bearer <mcpToken>"
```

Tools: `get_status`, `get_inventory`, `get_nearby`, `get_recent_events`, `send_chat`, `look_at`, `set_control`, `equip_item`, `toss_item`, `use_item`, `activate_block`, `set_behaviours`, `connect`, `disconnect`, `run_script`.

## Scripts

Scripts are JavaScript run as an async function inside the bot process with `bot`, `log`, `sleep` and `signal` in scope. They can be run on demand, on every spawn, or through the `run_script` MCP tool. They are **not sandboxed**: anyone with the panel password or the MCP token has full control of the bot process and the account.

## Deploy

Build and push both images, then install the chart:

```bash
task images REGISTRY=registry.example.com/me TAG=0.1.0
docker push registry.example.com/me/mineflayer-cp-panel:0.1.0
docker push registry.example.com/me/mineflayer-cp-bot:0.1.0

helm install mc charts/mineflayer-cp -n minecraft --create-namespace \
  --set image.repository=registry.example.com/me/mineflayer-cp-panel \
  --set bot.image.repository=registry.example.com/me/mineflayer-cp-bot \
  --set ingress.enabled=true --set ingress.host=mc.example.com
```

The chart generates the admin password and MCP token unless you set them or point `secret.existingSecret` at your own Secret:

```bash
kubectl -n minecraft get secret mc-mineflayer-cp -o jsonpath='{.data.adminPassword}' | base64 -d
kubectl -n minecraft get secret mc-mineflayer-cp -o jsonpath='{.data.mcpToken}' | base64 -d
```

The session cookie is `Secure`, so reach the panel over HTTPS (or `kubectl port-forward` to localhost).

## Develop

```bash
task install
task dev:panel            # http://localhost:3000, password "admin", Kubernetes disabled
task dev:bot -- <id>      # runs the bot for an account created in the dev panel
task test
```

A bot can also run with no panel at all:

```bash
BOT_SPEC='{"id":"a","username":"Name","host":"localhost","auth":"offline"}' node apps/bot/dist/main.js
```

## Notes

- The bot image is large (about 1.4 GB unpacked) because `minecraft-data`, `minecraft-assets` and the viewer's textures ship data for every Minecraft version.
- `prismarine-viewer` lists textures up to 1.21.4; newer servers render with the closest set. The viewer is off by default and isolated from the bot's connection.
- The inventory page loads its font from a public CDN.
