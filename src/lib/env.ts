import { z } from "zod";

const EnvSchema = z.object({
  ARC_RPC_URL: z
    .string({ required_error: "ARC_RPC_URL is required in .env" })
    .url("ARC_RPC_URL must be a valid HTTP(S) URL")
    .min(10),
  ARC_CHAIN_ID: z
    .union([z.string(), z.number()])
    .transform((v) =>
      typeof v === "string" && v.trim().length > 0 ? Number(v) : v
    )
    .pipe(z.number().int().positive().default(5042))
    .optional(),
  ARC_EXPLORER_URL: z
    .string()
    .url("ARC_EXPLORER_URL must be a valid URL")
    .default("https://arc-scan.org/"),
  ARC_USDC_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "ARC_USDC_ADDRESS must be a 40-hex 0x address")
    .default("0x3600000000000000000000000000000000000000"),
  ARC_UNISWAP_V3_FACTORY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "ARC_UNISWAP_V3_FACTORY invalid address")
    .default("0xf0db7b58379503491d857db50ac9ece64c653918"),
  ARC_POSITION_MANAGER: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "ARC_POSITION_MANAGER invalid address")
    .default("0x39654a85a4c05127f5fd6ed22caec077a0fb1377"),
  ARC_SWAP_ROUTER: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "ARC_SWAP_ROUTER invalid address")
    .default("0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77"),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  WALLET_ENCRYPTION_KEY: z
    .string({
      required_error:
        "WALLET_ENCRYPTION_KEY is required in .env (generate: openssl rand -base64 48)",
    })
    .min(16, "WALLET_ENCRYPTION_KEY must be at least 16 chars"),
  AUTH_SECRET: z
    .string({ required_error: "AUTH_SECRET is required in .env" })
    .min(8, "AUTH_SECRET must be at least 8 chars"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;
let validationDone = false;

export function validateEnv(force = false): AppEnv {
  if (cached && !force) return cached;
  if (validationDone && !force && cached) return cached;

  const raw = {
    ARC_RPC_URL: process.env.ARC_RPC_URL,
    ARC_CHAIN_ID: process.env.ARC_CHAIN_ID,
    ARC_EXPLORER_URL: process.env.ARC_EXPLORER_URL,
    ARC_USDC_ADDRESS: process.env.ARC_USDC_ADDRESS,
    ARC_UNISWAP_V3_FACTORY: process.env.ARC_UNISWAP_V3_FACTORY,
    ARC_POSITION_MANAGER: process.env.ARC_POSITION_MANAGER,
    ARC_SWAP_ROUTER: process.env.ARC_SWAP_ROUTER,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    WALLET_ENCRYPTION_KEY: process.env.WALLET_ENCRYPTION_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (i) =>
          `  • [${i.path.join(".")}] ${i.message} — got: ${JSON.stringify(
            (raw as Record<string, unknown>)[i.path[0] as string]
          )}`
      )
      .join("\n");
    const msg =
      `\n[ENV VALIDATION FAILED] Pastikan kamu mengisi file \`.env\` (bukan file lain) dengan benar.\n` +
      `Required keys from .env:\n${issues}\n`;
    console.error(msg);
    throw new Error(msg);
  }

  cached = parsed.data;
  validationDone = true;
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[env] OK · loaded from .env · ARC_CHAIN_ID=${cached.ARC_CHAIN_ID} · RPC=${
        cached.ARC_RPC_URL ? "configured" : "MISSING"
      }`
    );
  }
  return cached;
}

export function getEnv(): AppEnv {
  return validateEnv(false);
}
