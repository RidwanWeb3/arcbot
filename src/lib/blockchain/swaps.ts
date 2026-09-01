import {
  createWalletClient,
  http,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type HttpTransport,
  type Chain,
  decodeFunctionResult,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcMainnet, getArcPublicClient, getArcRpcUrl } from "./arc";
import {
  ARC_CONTRACTS,
  BOT_FEE,
  ERC20_ABI,
  UNISWAP_V3_SWAP_ROUTER_ABI,
  type UniswapFeeTier,
} from "./contracts";
import type { TokenInfo } from "@/types";
import { resolvePoolAndFee } from "./quotes";

export interface SigningContext {
  account: Account;
  walletClient: WalletClient<HttpTransport, Chain, Account>;
  publicClient: PublicClient<HttpTransport, Chain>;
}

export function createSigningContext(privateKey: Hex): SigningContext {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: arcMainnet,
    transport: http(getArcRpcUrl(), { timeout: 45_000, retryCount: 0 }),
  });
  const publicClient = getArcPublicClient();
  return { account, walletClient, publicClient };
}

export interface NativeTransferResult {
  success: boolean;
  txHash?: Hex;
  error?: string;
  gasUsed?: bigint;
  blockNumber?: number;
}

async function resolveNonce(ctx: SigningContext): Promise<number> {
  try {
    return await ctx.publicClient.getTransactionCount({
      address: ctx.account.address,
      blockTag: "pending",
    });
  } catch {
    return await ctx.publicClient.getTransactionCount({
      address: ctx.account.address,
    });
  }
}

async function resolveGasPrice(ctx: SigningContext): Promise<bigint> {
  try {
    return await ctx.publicClient.getGasPrice();
  } catch {
    return 100_000_000_000n;
  }
}

async function broadcastAndWait(
  ctx: SigningContext,
  params: {
    to: Address;
    value?: bigint;
    data?: Hex;
  }
): Promise<NativeTransferResult> {
  try {
    const nonce = await resolveNonce(ctx);
    const gasPrice = await resolveGasPrice(ctx);
    const hash = await ctx.walletClient.sendTransaction({
      to: params.to,
      value: params.value ?? 0n,
      data: params.data,
      nonce,
      gasPrice,
      chain: arcMainnet,
    });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
    return {
      success: receipt.status === "success",
      txHash: hash,
      error: receipt.status === "success" ? undefined : "Transaction reverted",
      gasUsed: receipt.gasUsed,
      blockNumber: Number(receipt.blockNumber),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Transaction failed",
    };
  }
}

export async function sendNativeTransfer(params: {
  ctx: SigningContext;
  to: Hex;
  amount: bigint;
}): Promise<NativeTransferResult> {
  return broadcastAndWait(params.ctx, { to: params.to, value: params.amount });
}

export const SWAP_DEADLINE_BUFFER_SECONDS = 60 * 20;

export const MAX_UINT256 =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

export async function getErc20Allowance(
  ctx: SigningContext,
  token: Address,
  spender: Address
): Promise<bigint> {
  try {
    const result = (await ctx.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [ctx.account.address, spender],
    })) as unknown;
    return typeof result === "bigint" ? result : 0n;
  } catch {
    return 0n;
  }
}

export async function approveErc20IfNeeded(params: {
  ctx: SigningContext;
  token: Address;
  spender: Address;
  requiredAmount: bigint;
}): Promise<NativeTransferResult | null> {
  const { ctx, token, spender, requiredAmount } = params;
  if (requiredAmount <= 0n) return null;
  const current = await getErc20Allowance(ctx, token, spender);
  if (current >= requiredAmount) return null;
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, MAX_UINT256],
  });
  const res = await broadcastAndWait(ctx, { to: token, data });
  if (!res.success) return res;
  let retries = 0;
  while (retries < 10) {
    const after = await getErc20Allowance(ctx, token, spender);
    if (after >= requiredAmount) break;
    await new Promise((r) => setTimeout(r, 500));
    retries++;
  }
  return res;
}

export interface SwapResult extends NativeTransferResult {
  amountOut?: bigint;
}

export interface ExecuteSwapParams {
  ctx: SigningContext;
  direction: "BUY" | "SELL";
  token: TokenInfo;
  amount: bigint;
  minimumOutput: bigint;
  recipient?: Address;
}

export async function executeV3Swap(
  params: ExecuteSwapParams
): Promise<SwapResult> {
  const { ctx, direction, token, amount, minimumOutput, recipient } = params;
  if (amount <= 0n) {
    return { success: false, error: "Zero swap amount" };
  }
  const poolInfo = await resolvePoolAndFee(token.address as Hex);
  if (!poolInfo) {
    return { success: false, error: "No Uniswap V3 pool found for this token" };
  }
  const fee: UniswapFeeTier = poolInfo.fee;
  const recipientAddr: Address = recipient ?? ctx.account.address;
  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + SWAP_DEADLINE_BUFFER_SECONDS
  );
  const router = ARC_CONTRACTS.SWAP_ROUTER;
  const usdc = ARC_CONTRACTS.USDC;

  const approvalToken = direction === "BUY" ? usdc : (token.address as Address);
  const approveRes = await approveErc20IfNeeded({
    ctx,
    token: approvalToken,
    spender: router,
    requiredAmount: amount,
  });
  if (approveRes && !approveRes.success) {
    return {
      success: false,
      error: `Approve failed: ${approveRes.error ?? "unknown"}`,
    };
  }

  let data: Hex;
  let value = 0n;
  if (direction === "BUY") {
    data = encodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: usdc,
          tokenOut: token.address as Address,
          fee,
          recipient: recipientAddr,
          deadline,
          amountIn: amount,
          amountOutMinimum: minimumOutput,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  } else {
    data = encodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: token.address as Address,
          tokenOut: usdc,
          fee,
          recipient: recipientAddr,
          deadline,
          amountIn: amount,
          amountOutMinimum: minimumOutput,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  }

  const submit = await broadcastAndWait(ctx, {
    to: router,
    value,
    data,
  });
  if (!submit.success || !submit.txHash) return submit;

  let amountOut: bigint | undefined;
  try {
    const tx = await ctx.publicClient.getTransaction({ hash: submit.txHash });
    if (tx.input && tx.input.length >= 10) {
      try {
        const decoded = decodeFunctionResult({
          abi: UNISWAP_V3_SWAP_ROUTER_ABI,
          functionName: "exactInputSingle",
          data: tx.input,
        });
        if (typeof decoded === "bigint") amountOut = decoded;
      } catch {
        // fallback: read from receipt logs if available
      }
    }
  } catch {
    // ignore, amountOut non-critical
  }
  return { ...submit, amountOut };
}

export { ARC_CONTRACTS, BOT_FEE };
