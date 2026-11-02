import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";

// Opens WhatsApp with the message ready (and the chat, when the number is
// known); the person then sends it themselves.
export function WhatsAppButton({
  label = "WhatsApp",
  onOpen,
  phone,
  size = "small",
  text,
}: {
  label?: string;
  onOpen?: () => void;
  phone?: string | null;
  size?: "large" | "small";
  text: string;
}) {
  return (
    <a
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#1fa855] font-semibold text-white transition hover:bg-[#178a45] ${
        size === "large" ? "h-11 px-5 text-sm" : "h-8 px-3 text-xs"
      }`}
      href={whatsappLink(text, phone)}
      onClick={onOpen}
      rel="noopener noreferrer"
      target="_blank"
      title={phone ? undefined : "Bez čísla: kontakt vybereš ve WhatsAppu"}
    >
      <MessageCircle size={size === "large" ? 16 : 14} />
      {label}
    </a>
  );
}
