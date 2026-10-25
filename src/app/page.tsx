import type { Metadata } from "next";
import { Vault } from "@/features/vault/Vault";

export const metadata: Metadata = { title: "KnowBefore · Research vault" };

export default function Home() {
  return <Vault />;
}
