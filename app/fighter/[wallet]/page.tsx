import { WalletRpg } from "@/components/WalletRpg";
export default async function FighterPage({ params }: { params: Promise<{ wallet: string }> }) { const { wallet } = await params; return <WalletRpg initialWallet={decodeURIComponent(wallet)} />; }
