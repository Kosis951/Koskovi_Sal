// WhatsApp "click to chat" links: the message is prepared here and the person
// sending it only taps Send in their own WhatsApp. No API, nothing is sent by
// the server. Shared by the server (validation) and the pages.

export const maxPhoneInputLength = 30;

// A phone number as WhatsApp wants it: international digits without "+".
// Czech numbers may be written without the country code. Returns "" for an
// empty input and null for something that is not a phone number.
export function normalizePhone(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  if (!/^\+?[\d\s().\-/]+$/.test(trimmed)) {
    return null;
  }

  let digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("00") || (!trimmed.startsWith("+") && digits.startsWith("00"))) {
    digits = digits.slice(2);
  } else if (!trimmed.startsWith("+") && digits.length === 9) {
    digits = `420${digits}`;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// "+420 777 123 456" for display (other countries just get the "+").
export function formatPhone(digits: string) {
  return digits.startsWith("420") && digits.length === 12
    ? `+420 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : `+${digits}`;
}

// Without a number WhatsApp opens with the text and lets the sender pick the
// contact.
export function whatsappLink(text: string, phone?: string | null) {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}
